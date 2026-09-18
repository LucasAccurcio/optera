import type { PrismaClient } from "@prisma/client";
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
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()))
    throw new AppError("VALIDATION_ERROR", `Invalid date: ${value}`);
  return date;
}

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function serializeOperation(operation: any) {
  const totalPremium = calculateTotalPremium(
    operation.entryPremium.toString(),
    operation.quantity,
  );
  const closingPrice = operation.closedAt
    ? operation.actualClosingPrice
    : operation.simulatedClosingPrice;
  const result = calculateResult(
    operation.side,
    operation.entryPremium.toString(),
    closingPrice.toString(),
    operation.quantity,
  );
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
    openedAt: serializeDate(operation.openedAt),
    entryPremium: operation.entryPremium.toString(),
    simulatedClosingPrice: operation.simulatedClosingPrice.toString(),
    closedAt: serializeDate(operation.closedAt),
    actualClosingPrice: operation.actualClosingPrice?.toString() ?? null,
    strategyId: operation.strategyId,
    notes: operation.notes,
    status: operation.closedAt ? "CLOSED" : "OPEN",
    totalPremium: totalPremium.toString(),
    result: result.toString(),
    resultPercentage,
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
    if (current.closedAt)
      throw new AppError(
        "OPERATION_CLOSED",
        "Closed operations cannot be edited",
        409,
      );
    return serializeOperation(
      await this.repository.update(id, toUpdateData(input, current) as any),
    );
  }

  async remove(id: string) {
    const current = await this.repository.findById(id);
    if (!current) throw new AppError("NOT_FOUND", "Operation not found", 404);
    await this.repository.delete(id);
  }

  async updateSimulation(id: string, simulatedClosingPrice: string) {
    const current = await this.repository.findById(id);
    if (!current) throw new AppError("NOT_FOUND", "Operation not found", 404);
    if (current.closedAt)
      throw new AppError(
        "OPERATION_CLOSED",
        "Closed operations cannot be simulated",
        409,
      );
    return serializeOperation(
      await this.repository.update(id, { simulatedClosingPrice }),
    );
  }

  async close(id: string, input: CloseOperationInput) {
    const current = await this.repository.findById(id);
    if (!current) throw new AppError("NOT_FOUND", "Operation not found", 404);
    if (current.closedAt)
      throw new AppError(
        "OPERATION_CLOSED",
        "Operation is already closed",
        409,
      );
    const closedAt = dateValue(input.closedAt);
    if (closedAt < current.openedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Closing date cannot be before opening date",
      );
    }
    return serializeOperation(
      await this.repository.update(id, {
        closedAt,
        actualClosingPrice: input.actualClosingPrice,
      }),
    );
  }

  async list(query: OperationListQuery) {
    const where: any = {
      ...(query.status === "OPEN" ? { closedAt: null } : {}),
      ...(query.status === "CLOSED" ? { closedAt: { not: null } } : {}),
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
    const [operations, total] = await this.repository.findMany(
      where,
      (query.page - 1) * query.pageSize,
      query.pageSize,
      { [query.sortBy]: query.sortOrder },
    );
    return {
      data: operations.map(serializeOperation),
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
