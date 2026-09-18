import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { StrategyService } from "../src/modules/strategies/service.js";

const strategyId = "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1";
const operationId = "6f6d8d13-5e23-4f64-8e38-08ea34a1f2d1";

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: operationId,
    asset: "BBSE3",
    optionTicker: "BBSEV436",
    optionType: "PUT",
    side: "SELL",
    quantity: 100,
    strike: new Decimal("40"),
    entryPremium: new Decimal("1"),
    simulatedClosingPrice: new Decimal("0.4"),
    closedAt: null,
    actualClosingPrice: null,
    strategyId,
    ...overrides,
  };
}

function prismaMock() {
  const strategy = {
    id: strategyId,
    name: "Trava de baixa",
    asset: "BBSE3",
    type: "PUT spread",
    openedAt: new Date("2026-01-10T00:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-10T00:00:00.000Z"),
    updatedAt: new Date("2026-01-10T00:00:00.000Z"),
    operations: [operation()],
  };
  return {
    strategy: {
      findUnique: async () => strategy,
      findMany: async () => [strategy],
      create: async ({ data }: any) => ({
        ...strategy,
        ...data,
        operations: [],
      }),
      update: async ({ data }: any) => ({ ...strategy, ...data }),
      delete: async () => strategy,
    },
    operation: {
      findUnique: async () => operation(),
      update: async () => operation(),
    },
  };
}

describe("strategy service", () => {
  it("consolidates legs using each operation result", async () => {
    const service = new StrategyService(prismaMock() as any);
    const result = await service.getById(strategyId);
    expect(result.operations).toHaveLength(1);
    expect(result.totalPremium).toBe("100");
    expect(result.result).toBe("60");
    expect(result.resultPercentage).toBe("0.6");
    expect(result.status).toBe("OPEN");
  });

  it("uses the effective closing price for closed legs", async () => {
    const prisma = prismaMock();
    const closed = operation({
      closedAt: new Date("2026-02-01T00:00:00.000Z"),
      actualClosingPrice: new Decimal("0.5"),
    });
    const strategy = {
      id: strategyId,
      name: "Trava",
      asset: "BBSE3",
      type: null,
      openedAt: new Date("2026-01-10T00:00:00.000Z"),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      operations: [closed],
    };
    const mock = {
      ...prisma,
      strategy: {
        ...prisma.strategy,
        findUnique: async () => strategy,
        findMany: async () => [strategy],
      },
    };
    const result = await new StrategyService(mock as any).getById(strategyId);
    expect(result.result).toBe("50");
    expect(result.status).toBe("CLOSED");
  });

  it("rejects an operation already associated with another strategy", async () => {
    const prisma = prismaMock();
    prisma.operation.findUnique = async () =>
      operation({ strategyId: "7f6d8d13-5e23-4f64-8e38-08ea34a1f2d1" });
    await expect(
      new StrategyService(prisma as any).addOperation(strategyId, operationId),
    ).rejects.toMatchObject({ code: "OPERATION_ALREADY_ASSOCIATED" });
  });
});
