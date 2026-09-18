import type { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import {
  calculateOperationResult,
  calculateResultPercentage,
  calculateTotalPremium,
} from "../../shared/financial/index.js";
import { AppError } from "../../shared/errors.js";
import type { CreateStrategyInput, UpdateStrategyInput } from "./schemas.js";
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

function serializeStrategy(strategy: any) {
  const legs = strategy.operations.map((operation: any) => {
    const result = calculateOperationResult(
      {
        side: operation.side,
        entryPremium: operation.entryPremium.toString(),
        quantity: operation.quantity,
        simulatedClosingPrice: operation.simulatedClosingPrice.toString(),
        closedAt: operation.closedAt,
        actualClosingPrice: operation.actualClosingPrice?.toString() ?? null,
      },
      operation.closedAt ? "actual" : "simulated",
    );
    return {
      id: operation.id,
      asset: operation.asset,
      optionTicker: operation.optionTicker,
      optionType: operation.optionType,
      side: operation.side,
      quantity: operation.quantity,
      strike: operation.strike.toString(),
      entryPremium: operation.entryPremium.toString(),
      simulatedClosingPrice: operation.simulatedClosingPrice.toString(),
      actualClosingPrice: operation.actualClosingPrice?.toString() ?? null,
      closedAt: serializeDate(operation.closedAt),
      status: operation.closedAt ? "CLOSED" : "OPEN",
      totalPremium: calculateTotalPremium(
        operation.entryPremium.toString(),
        operation.quantity,
      ).toString(),
      result: result.toString(),
      resultPercentage: calculateResultPercentage(
        result.toString(),
        operation.entryPremium.times(operation.quantity).toString(),
      ).toString(),
    };
  });
  const totalPremium = legs.reduce(
    (total: Decimal, leg: any) => total.plus(leg.totalPremium),
    new Decimal(0),
  );
  const result = legs.reduce(
    (total: Decimal, leg: any) => total.plus(leg.result),
    new Decimal(0),
  );
  return {
    id: strategy.id,
    name: strategy.name,
    asset: strategy.asset,
    type: strategy.type,
    openedAt: serializeDate(strategy.openedAt),
    notes: strategy.notes,
    status:
      legs.length > 0 && legs.every((leg: any) => leg.status === "CLOSED")
        ? "CLOSED"
        : "OPEN",
    operations: legs,
    totalPremium: totalPremium.toString(),
    result: result.toString(),
    resultPercentage: calculateResultPercentage(
      result.toString(),
      totalPremium.toString(),
    ).toString(),
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
    if (!(await this.repository.findById(id)))
      throw new AppError("NOT_FOUND", "Strategy not found", 404);
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
    if (!(await this.repository.findById(id)))
      throw new AppError("NOT_FOUND", "Strategy not found", 404);
    await this.repository.delete(id);
  }

  async addOperation(strategyId: string, operationId: string) {
    const strategy = await this.repository.findById(strategyId);
    if (!strategy) throw new AppError("NOT_FOUND", "Strategy not found", 404);
    const operation = await this.repository.findOperation(operationId);
    if (!operation) throw new AppError("NOT_FOUND", "Operation not found", 404);
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
    await this.repository.dissociateOperation(operationId);
    return this.getById(strategyId);
  }
}
