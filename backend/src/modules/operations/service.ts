import type { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import {
  calculateInitialClosingPrice,
  calculateResult,
  calculateResultPercentage,
  calculateTotalPremium,
} from "../../shared/financial/index.js";
import { AppError } from "../../shared/errors.js";
import type {
  CloseOperationInput,
  CreateOperationInput,
  OperationListQuery,
  UpdateOperationInput,
} from "./schemas.js";
import { OperationRepository } from "./repository.js";

function dateValue(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AppError("VALIDATION_ERROR", `Invalid date: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new AppError("VALIDATION_ERROR", `Invalid date: ${value}`);
  return date;
}

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toNonNegativeDecimal(value: string, field: string): Decimal {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new AppError("VALIDATION_ERROR", `${field} must be a valid decimal value`);
  }
  if (!decimal.isFinite() || decimal.isNegative())
    throw new AppError("VALIDATION_ERROR", `${field} cannot be negative`);
  return decimal;
}

function closureBalances(operation: any) {
  const closures = operation.closures ?? [];
  const closedQuantity = closures.reduce(
    (total: number, closure: any) => total + closure.quantity,
    0,
  );
  if (closedQuantity > operation.quantity)
    throw new AppError("INVALID_CLOSURE_BALANCE", "Closed quantity exceeds initial quantity", 500);
  return { closures, closedQuantity, openQuantity: operation.quantity - closedQuantity };
}

function serializeOperation(operation: any) {
  const { closures, closedQuantity, openQuantity } = closureBalances(operation);
  const totalPremium = calculateTotalPremium(
    operation.entryPremium.toString(),
    operation.quantity,
  );
  const realizedResult = closures.reduce(
    (total: Decimal, closure: any) =>
      total.plus(calculateResult(
        operation.side,
        operation.entryPremium.toString(),
        closure.actualClosingPrice.toString(),
        closure.quantity,
      )),
    new Decimal(0),
  );
  const estimatedOpenResult = openQuantity > 0
    ? calculateResult(
        operation.side,
        operation.entryPremium.toString(),
        operation.simulatedClosingPrice.toString(),
        openQuantity,
      )
    : new Decimal(0);
  const result = realizedResult.plus(estimatedOpenResult);
  const resultPercentage = calculateResultPercentage(
    result.toString(),
    totalPremium.toString(),
  ).toString();
  return {
    id: operation.id,
    asset: operation.asset,
    optionTicker: operation.optionTicker,
    optionType: operation.optionType,
    side: operation.side,
    expirationDate: serializeDate(operation.expirationDate),
    strike: operation.strike.toString(),
    quantity: operation.quantity,
    closedQuantity,
    openQuantity,
    openedAt: serializeDate(operation.openedAt),
    entryPremium: operation.entryPremium.toString(),
    simulatedClosingPrice: operation.simulatedClosingPrice.toString(),
    closures: closures.map((closure: any) => ({
      id: closure.id,
      operationId: closure.operationId,
      quantity: closure.quantity,
      actualClosingPrice: closure.actualClosingPrice.toString(),
      closedAt: serializeDate(closure.closedAt),
      createdAt: closure.createdAt.toISOString(),
    })),
    strategyId: operation.strategyId,
    notes: operation.notes,
    status: openQuantity === 0
      ? "CLOSED"
      : closedQuantity > 0
        ? "PARTIALLY_CLOSED"
        : "OPEN",
    totalPremium: totalPremium.toString(),
    result: result.toString(),
    resultPercentage,
    realizedResult: realizedResult.toString(),
    estimatedOpenResult: estimatedOpenResult.toString(),
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
  };
}

function toCreateData(input: CreateOperationInput) {
  return {
    asset: input.asset,
    optionTicker: input.optionTicker,
    optionType: input.optionType,
    side: input.side,
    expirationDate: dateValue(input.expirationDate),
    strike: input.strike,
    quantity: input.quantity,
    openedAt: dateValue(input.openedAt),
    entryPremium: input.entryPremium,
    simulatedClosingPrice: calculateInitialClosingPrice(
      input.side,
      input.entryPremium,
    ).toString(),
    strategy: input.strategyId
      ? { connect: { id: input.strategyId } }
      : undefined,
    notes: input.notes ?? null,
  };
}

function toUpdateData(input: UpdateOperationInput, current: any) {
  const updatedSide = input.side ?? current.side;
  const updatedPremium = input.entryPremium ?? current.entryPremium.toString();
  const shouldRefreshSimulation =
    input.entryPremium !== undefined || input.side !== undefined;
  return {
    ...(input.asset === undefined ? {} : { asset: input.asset }),
    ...(input.optionTicker === undefined
      ? {}
      : { optionTicker: input.optionTicker }),
    ...(input.optionType === undefined ? {} : { optionType: input.optionType }),
    ...(input.side === undefined ? {} : { side: input.side }),
    ...(input.expirationDate === undefined
      ? {}
      : { expirationDate: dateValue(input.expirationDate) }),
    ...(input.strike === undefined ? {} : { strike: input.strike }),
    ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
    ...(input.openedAt === undefined
      ? {}
      : { openedAt: dateValue(input.openedAt) }),
    ...(input.entryPremium === undefined
      ? {}
      : { entryPremium: input.entryPremium }),
    ...(shouldRefreshSimulation
      ? {
          simulatedClosingPrice: calculateInitialClosingPrice(
            updatedSide,
            updatedPremium,
          ).toString(),
        }
      : {}),
    ...(input.strategyId === undefined
      ? {}
      : input.strategyId === null
        ? { strategy: { disconnect: true } }
        : { strategy: { connect: { id: input.strategyId } } }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
}

export class OperationService {
  private readonly repository: OperationRepository;

  constructor(prisma: PrismaClient) {
    this.repository = new OperationRepository(prisma);
  }

  async create(input: CreateOperationInput) {
    return serializeOperation(
      await this.repository.create(toCreateData(input) as any),
    );
  }

  async getById(id: string) {
    const operation = await this.repository.findById(id);
    if (!operation) throw new AppError("NOT_FOUND", "Operation not found", 404);
    return serializeOperation(operation);
  }

  async update(id: string, input: UpdateOperationInput) {
    const current = await this.repository.findById(id);
    if (!current) throw new AppError("NOT_FOUND", "Operation not found", 404);
    const hasClosures = (current.closures ?? []).length > 0;
    const payoffFields = [
      "asset",
      "optionTicker",
      "optionType",
      "side",
      "expirationDate",
      "strike",
      "quantity",
      "openedAt",
      "entryPremium",
    ] as const;
    if (hasClosures && payoffFields.some((field) => input[field] !== undefined))
      throw new AppError(
        "OPERATION_CLOSED",
        "Payoff fields cannot be edited after a closure",
        409,
      );
    return serializeOperation(
      await this.repository.update(id, toUpdateData(input, current) as any),
    );
  }

  async remove(id: string) {
    const current = await this.repository.findById(id);
    if (!current) throw new AppError("NOT_FOUND", "Operation not found", 404);
    if ((current.closures ?? []).length > 0)
      throw new AppError("OPERATION_CLOSED", "Operations with closures cannot be deleted", 409);
    await this.repository.delete(id);
  }

  async updateSimulation(id: string, simulatedClosingPrice: string) {
    const current = await this.repository.findById(id);
    if (!current) throw new AppError("NOT_FOUND", "Operation not found", 404);
    if (closureBalances(current).openQuantity === 0)
      throw new AppError(
        "OPERATION_CLOSED",
        "Fully closed operations cannot be simulated",
        409,
      );
    return serializeOperation(
      await this.repository.update(id, { simulatedClosingPrice }),
    );
  }

  async close(id: string, input: CloseOperationInput) {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)
      throw new AppError("VALIDATION_ERROR", "Closing quantity must be a positive integer");
    const closedAt = dateValue(input.closedAt);
    const actualClosingPrice = toNonNegativeDecimal(
      input.actualClosingPrice,
      "Actual closing price",
    );
    try {
      const updated = await this.repository.transaction(async (transaction) => {
        const current = await transaction.operation.findUnique({
          where: { id },
          include: { closures: true },
        });
        if (!current)
          throw new AppError("NOT_FOUND", "Operation not found", 404);
        if (closedAt < current.openedAt) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Closing date cannot be before opening date",
          );
        }
        const { openQuantity } = closureBalances(current);
        if (openQuantity === 0)
          throw new AppError("OPERATION_CLOSED", "Operation is already closed", 409);
        if (input.quantity > openQuantity)
          throw new AppError(
            "CLOSURE_QUANTITY_EXCEEDS_OPEN",
            "Closing quantity exceeds remaining open quantity",
            409,
          );
        await transaction.operationClosure.create({
          data: {
            operationId: id,
            quantity: input.quantity,
            actualClosingPrice,
            closedAt,
          },
        });
        return transaction.operation.findUnique({
          where: { id },
          include: {
            closures: { orderBy: [{ closedAt: "asc" }, { createdAt: "asc" }] },
          },
        });
      });
      return serializeOperation(updated);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if ((error as any)?.code === "P2034")
        throw new AppError(
          "CLOSURE_CONFLICT",
          "Operation changed concurrently; retry the closure",
          409,
        );
      throw error;
    }
  }

  async list(query: OperationListQuery) {
    const where: any = {
      ...(query.asset
        ? { asset: { contains: query.asset, mode: "insensitive" } }
        : {}),
      ...(query.optionType ? { optionType: query.optionType } : {}),
      ...(query.side ? { side: query.side } : {}),
      ...(query.strategyId ? { strategyId: query.strategyId } : {}),
      ...(query.expirationFrom || query.expirationTo
        ? {
            expirationDate: {
              ...(query.expirationFrom
                ? { gte: dateValue(query.expirationFrom) }
                : {}),
              ...(query.expirationTo
                ? { lte: dateValue(query.expirationTo) }
                : {}),
            },
          }
        : {}),
    };
    const operations = await this.repository.findMany(
      where,
      { [query.sortBy]: query.sortOrder },
    );
    const all = operations.map(serializeOperation);
    const filtered = query.status === "ALL"
      ? all
      : all.filter((operation) => operation.status === query.status);
    const total = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      data: filtered.slice(start, start + query.pageSize),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async listAvailableForStrategy() {
    const [operations, total] = await this.repository.findAvailableForStrategy();
    return {
      data: operations.map(serializeOperation),
      meta: {
        page: 1,
        pageSize: 100,
        total,
        totalPages: Math.ceil(total / 100),
      },
    };
  }
}
