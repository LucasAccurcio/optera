import type { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import {
  analyzeVerticalSpread,
  calculateResult,
  calculateResultPercentage,
  calculateTotalPremium,
} from "../../shared/financial/index.js";
import { AppError } from "../../shared/errors.js";
import type {
  CloseStrategyInput,
  CreateStrategyInput,
  UpdateStrategyInput,
} from "./schemas.js";
import { StrategyRepository } from "./repository.js";

function dateValue(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()))
    throw new AppError("VALIDATION_ERROR", `Invalid date: ${value}`);
  return date;
}

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function closureBalances(operation: any) {
  const closures = operation.closures ?? [];
  const closedQuantity = closures.reduce(
    (total: number, closure: any) => total + closure.quantity,
    0,
  );
  if (closedQuantity > operation.quantity) {
    throw new AppError(
      "INVALID_CLOSURE_BALANCE",
      "Closed quantity exceeds initial quantity",
      500,
    );
  }
  return { closures, closedQuantity, openQuantity: operation.quantity - closedQuantity };
}

function closureResult(operation: any, closure: any): Decimal {
  return calculateResult(
    operation.side,
    operation.entryPremium.toString(),
    closure.actualClosingPrice.toString(),
    closure.quantity,
  );
}

function serializeClosure(closure: any) {
  return {
    id: closure.id,
    operationId: closure.operationId,
    quantity: closure.quantity,
    actualClosingPrice: closure.actualClosingPrice.toString(),
    closedAt: serializeDate(closure.closedAt),
    createdAt: closure.createdAt.toISOString(),
  };
}

function serializeOperation(operation: any, exposure: Record<string, number> = {}) {
  const { closures, closedQuantity, openQuantity } = closureBalances(operation);
  const totalPremium = calculateTotalPremium(
    operation.entryPremium.toString(),
    operation.quantity,
  );
  const realizedResult = closures.reduce(
    (total: Decimal, closure: any) => total.plus(closureResult(operation, closure)),
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
  const resultPercentage = totalPremium.isZero()
    ? new Decimal(0)
    : calculateResultPercentage(result.toString(), totalPremium.toString());
  const status = openQuantity === 0
    ? "CLOSED"
    : closedQuantity > 0
      ? "PARTIALLY_CLOSED"
      : "OPEN";

  return {
    id: operation.id,
    asset: operation.asset,
    optionTicker: operation.optionTicker,
    optionType: operation.optionType,
    side: operation.side,
    quantity: operation.quantity,
    closedQuantity,
    openQuantity,
    strike: operation.strike.toString(),
    expirationDate: serializeDate(operation.expirationDate),
    openedAt: serializeDate(operation.openedAt),
    entryPremium: operation.entryPremium.toString(),
    simulatedClosingPrice: operation.simulatedClosingPrice.toString(),
    closures: closures.map(serializeClosure),
    strategyId: operation.strategyId,
    notes: operation.notes,
    status,
    totalPremium: totalPremium.toString(),
    realizedResult: realizedResult.toString(),
    estimatedOpenResult: estimatedOpenResult.toString(),
    result: result.toString(),
    resultPercentage: resultPercentage.toString(),
    ...exposure,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
  };
}

function spreadLeg(operation: any, quantity = operation.quantity) {
  return {
    asset: operation.asset,
    expirationDate: serializeDate(operation.expirationDate) ?? "",
    optionType: operation.optionType,
    side: operation.side,
    strike: operation.strike.toString(),
    quantity,
    entryPremium: operation.entryPremium.toString(),
  };
}

type StrategyOperationBalance = {
  operation: any;
  closures: any[];
  closedQuantity: number;
  openQuantity: number;
};

function serializeStrategy(strategy: any) {
  const operationBalances: StrategyOperationBalance[] = strategy.operations.map((operation: any) => ({
    operation,
    ...closureBalances(operation),
  }));
  const initialAnalysis = operationBalances.length === 2
    ? analyzeVerticalSpread(operationBalances.map(({ operation }) => spreadLeg(operation)))
    : null;
  let pairedQuantity = 0;
  if (initialAnalysis?.status === "supported") {
    const longLeg = operationBalances.find(({ operation }) => operation.side === "BUY");
    const shortLeg = operationBalances.find(({ operation }) => operation.side === "SELL");
    if (longLeg && shortLeg) pairedQuantity = Math.min(longLeg.openQuantity, shortLeg.openQuantity);
  }
  const operations = operationBalances.map(({ operation, closedQuantity, openQuantity }) =>
    serializeOperation(operation, {
      protectedQuantity: pairedQuantity,
      unprotectedQuantity: openQuantity - pairedQuantity,
    }),
  );
  const openOperations = operationBalances.filter(({ openQuantity }) => openQuantity > 0);
  const spreadAnalysis = openOperations.length > 0
    ? analyzeVerticalSpread(openOperations.map(({ operation, openQuantity }) => spreadLeg(operation, openQuantity)))
    : null;
  const realizedResult = operations.reduce(
    (total: Decimal, operation: any) => total.plus(operation.realizedResult),
    new Decimal(0),
  );
  const estimatedOpenResult = operations.reduce(
    (total: Decimal, operation: any) => total.plus(operation.estimatedOpenResult),
    new Decimal(0),
  );
  const result = realizedResult.plus(estimatedOpenResult);
  const totalPremium = operations.reduce(
    (total: Decimal, operation: any) => total.plus(operation.totalPremium),
    new Decimal(0),
  );
  const totalOpenQuantity = operationBalances.reduce(
    (total: number, operation: any) => total + operation.openQuantity,
    0,
  );
  const totalClosedQuantity = operationBalances.reduce(
    (total: number, operation: any) => total + operation.closedQuantity,
    0,
  );
  const status = operationBalances.length === 0 || totalClosedQuantity === 0
    ? "OPEN"
    : totalOpenQuantity === 0
      ? "CLOSED"
      : "PARTIALLY_CLOSED";
  const maxProfitCapturedPercentage =
    spreadAnalysis?.status === "supported" && !new Decimal(estimatedOpenResult).isNegative()
      ? estimatedOpenResult.isZero()
        ? "0"
        : new Decimal(estimatedOpenResult)
          .dividedBy(spreadAnalysis.maxProfit)
          .times(100)
          .toString()
      : null;
  const resultPercentage = totalPremium.isZero()
    ? new Decimal(0)
    : calculateResultPercentage(result.toString(), totalPremium.toString());

  return {
    id: strategy.id,
    name: strategy.name,
    asset: strategy.asset,
    type: strategy.type,
    openedAt: serializeDate(strategy.openedAt),
    notes: strategy.notes,
    status,
    operations,
    spreadAnalysis,
    strategyType: spreadAnalysis?.status === "supported"
      ? spreadAnalysis.strategyType
      : initialAnalysis?.status === "supported"
        ? initialAnalysis.strategyType
        : null,
    totalPremium: totalPremium.toString(),
    realizedResult: realizedResult.toString(),
    estimatedOpenResult: estimatedOpenResult.toString(),
    result: result.toString(),
    resultPercentage: resultPercentage.toString(),
    maxProfitCapturedPercentage,
    createdAt: strategy.createdAt.toISOString(),
    updatedAt: strategy.updatedAt.toISOString(),
  };
}

export class StrategyService {
  private readonly repository: StrategyRepository;

  constructor(prisma: PrismaClient) {
    this.repository = new StrategyRepository(prisma);
  }

  async list() {
    return { data: (await this.repository.findMany()).map(serializeStrategy) };
  }

  async getById(id: string) {
    const strategy = await this.repository.findById(id);
    if (!strategy) throw new AppError("NOT_FOUND", "Strategy not found", 404);
    return serializeStrategy(strategy);
  }

  async create(input: CreateStrategyInput) {
    return serializeStrategy(
      await this.repository.create({
        name: input.name,
        asset: input.asset,
        type: input.type ?? null,
        openedAt: dateValue(input.openedAt),
        notes: input.notes ?? null,
      }),
    );
  }

  async update(id: string, input: UpdateStrategyInput) {
    const current = await this.repository.findById(id);
    if (!current)
      throw new AppError("NOT_FOUND", "Strategy not found", 404);
    if (
      current.operations.some((operation: any) => operation.closures?.length > 0) &&
      (input.asset !== undefined || input.type !== undefined)
    ) {
      throw new AppError(
        "OPERATION_CLOSED",
        "Payoff-defining strategy fields cannot be changed after a closure",
        409,
      );
    }
    return serializeStrategy(
      await this.repository.update(id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.asset === undefined ? {} : { asset: input.asset }),
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.openedAt === undefined
          ? {}
          : { openedAt: dateValue(input.openedAt) }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      }),
    );
  }

  async remove(id: string) {
    const strategy = await this.repository.findById(id);
    if (!strategy)
      throw new AppError("NOT_FOUND", "Strategy not found", 404);
    if (strategy.operations.some((operation: any) => operation.closures?.length > 0)) {
      throw new AppError(
        "OPERATION_CLOSED",
        "A strategy with closure history cannot be deleted",
        409,
      );
    }
    await this.repository.delete(id);
  }

  async addOperation(strategyId: string, operationId: string) {
    const strategy = await this.repository.findById(strategyId);
    if (!strategy) throw new AppError("NOT_FOUND", "Strategy not found", 404);
    const operation = await this.repository.findOperation(operationId);
    if (!operation) throw new AppError("NOT_FOUND", "Operation not found", 404);
    if (operation.closures?.length > 0) {
      throw new AppError(
        "OPERATION_CLOSED",
        "An operation with closure history cannot be associated",
        409,
      );
    }
    if (operation.strategyId && operation.strategyId !== strategyId)
      throw new AppError(
        "OPERATION_ALREADY_ASSOCIATED",
        "Operation already belongs to another strategy",
        409,
      );
    await this.repository.associateOperation(operationId, strategyId);
    return this.getById(strategyId);
  }

  async removeOperation(strategyId: string, operationId: string) {
    const strategy = await this.repository.findById(strategyId);
    if (!strategy) throw new AppError("NOT_FOUND", "Strategy not found", 404);
    const operation = await this.repository.findOperation(operationId);
    if (!operation || operation.strategyId !== strategyId)
      throw new AppError(
        "NOT_FOUND",
        "Operation is not associated with this strategy",
        404,
      );
    if (operation.closures?.length > 0) {
      throw new AppError(
        "OPERATION_CLOSED",
        "An operation with closure history cannot be dissociated",
        409,
      );
    }
    await this.repository.dissociateOperation(operationId);
    return this.getById(strategyId);
  }

  async close(id: string, input: CloseStrategyInput) {
    const closeRequests = input.legs.map((leg) => {
      let actualClosingPrice: Decimal;
      try {
        actualClosingPrice = new Decimal(leg.actualClosingPrice);
      } catch {
        throw new AppError("VALIDATION_ERROR", "Invalid actual closing price");
      }
      if (!actualClosingPrice.isFinite() || actualClosingPrice.isNegative()) {
        throw new AppError("VALIDATION_ERROR", "Invalid actual closing price");
      }
      return {
        ...leg,
        actualClosingPrice: actualClosingPrice.toString(),
        closingDate: dateValue(leg.closedAt),
      };
    });
    if (new Set(closeRequests.map((leg) => leg.operationId)).size !== closeRequests.length) {
      throw new AppError("VALIDATION_ERROR", "Duplicate operation in strategy closure");
    }

    try {
      const updated = await this.repository.transaction(async (transaction) => {
        const strategy = await transaction.strategy.findUnique({
          where: { id },
          include: { operations: { include: { closures: true } } },
        });
        if (!strategy) throw new AppError("NOT_FOUND", "Strategy not found", 404);
        const operations = strategy.operations as any[];
        const openOperations = operations.filter((operation) => {
          const closedQuantity = (operation.closures ?? []).reduce(
            (total: number, closure: any) => total + closure.quantity,
            0,
          );
          return operation.quantity - closedQuantity > 0;
        });
        if (openOperations.length === 0) {
          throw new AppError("STRATEGY_CLOSED", "Strategy has no open quantity", 409);
        }
        if (closeRequests.length !== openOperations.length) {
          throw new AppError(
            "STRATEGY_CLOSE_REQUIRES_ALL_OPEN_LEGS",
            "Every operation with an open balance must be included",
            409,
          );
        }

        const operationsById = new Map(openOperations.map((operation) => [operation.id, operation]));
        const validated = closeRequests.map((request) => {
          const operation = operationsById.get(request.operationId);
          if (!operation) {
            throw new AppError(
              "STRATEGY_CLOSE_REQUIRES_ALL_OPEN_LEGS",
              "Closure references an operation without an open balance in this strategy",
              409,
            );
          }
          const closedQuantity = (operation.closures ?? []).reduce(
            (total: number, closure: any) => total + closure.quantity,
            0,
          );
          const openQuantity = operation.quantity - closedQuantity;
          if (request.quantity !== openQuantity) {
            throw new AppError(
              "STRATEGY_CLOSE_REQUIRES_FULL_OPEN_QUANTITY",
              "Strategy close must close the complete remaining quantity of every open leg",
              409,
            );
          }
          if (request.closingDate < operation.openedAt) {
            throw new AppError(
              "VALIDATION_ERROR",
              "Closing date cannot be before opening date",
            );
          }
          return { ...request, operationId: operation.id };
        });

        for (const closure of validated) {
          await transaction.operationClosure.create({
            data: {
              operationId: closure.operationId,
              quantity: closure.quantity,
              actualClosingPrice: closure.actualClosingPrice,
              closedAt: closure.closingDate,
            },
          });
        }
        return transaction.strategy.findUnique({
          where: { id },
          include: {
            operations: {
              include: {
                closures: {
                  orderBy: [{ closedAt: "asc" }, { createdAt: "asc" }],
                },
              },
            },
          },
        });
      });
      if (!updated) throw new AppError("NOT_FOUND", "Strategy not found", 404);
      return serializeStrategy(updated);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if ((error as { code?: string } | null)?.code === "P2034") {
        throw new AppError(
          "CLOSURE_CONFLICT",
          "The strategy changed during closure; reload and try again",
          409,
        );
      }
      throw error;
    }
  }
}
