import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { StrategyService } from "../src/modules/strategies/service.js";

const strategyId = "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1";
const operationId = "6f6d8d13-5e23-4f64-8e38-08ea34a1f2d1";

function operation(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-10T00:00:00.000Z');
  return {
    id: operationId,
    asset: "BBSE3",
    optionTicker: "BBSEV436",
    optionType: "PUT",
    side: "SELL",
    expirationDate: new Date('2026-12-18T00:00:00.000Z'),
    quantity: 100,
    openedAt: now,
    strike: new Decimal("40"),
    entryPremium: new Decimal("1"),
    simulatedClosingPrice: new Decimal("0.4"),
    closures: [],
    strategyId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function closure(id: string, quantity: number, price: string, date: string) {
  return {
    id: `closure-${id}-${date}`,
    operationId: id,
    quantity,
    actualClosingPrice: new Decimal(price),
    closedAt: new Date(`${date}T00:00:00.000Z`),
    createdAt: new Date(`${date}T12:00:00.000Z`),
  };
}

function prismaMock(operations: any[] = [operation()]) {
  const strategy = {
    id: strategyId,
    name: "Trava de baixa",
    asset: "BBSE3",
    type: "PUT spread",
    openedAt: new Date("2026-01-10T00:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-10T00:00:00.000Z"),
    updatedAt: new Date("2026-01-10T00:00:00.000Z"),
    operations,
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
      findUnique: async ({ where }: any) =>
        operations.find((item) => item.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const current = operations.find((item) => item.id === where.id)!;
        Object.assign(current, data);
        return current;
      },
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
    const closed = operation({
      closures: [closure(operationId, 100, "0.5", "2026-02-01")],
    });
    const prisma = prismaMock([closed]);
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

  it("keeps an empty strategy open without spread metrics", async () => {
    const result = await new StrategyService(prismaMock([]) as any).getById(strategyId);

    expect(result.status).toBe("OPEN");
    expect(result.operations).toEqual([]);
    expect(result.result).toBe("0");
    expect(result.spreadAnalysis).toBeNull();
    expect(result.maxProfitCapturedPercentage).toBeNull();
  });

  it.each([
    {
      name: "BEAR_PUT",
      long: operation({
        id: "bear-put-long",
        optionType: "PUT",
        side: "BUY",
        strike: new Decimal("41.70"),
        quantity: 200,
        entryPremium: new Decimal("1.64"),
        simulatedClosingPrice: new Decimal("1.2"),
      }),
      short: operation({
        id: "bear-put-short",
        optionType: "PUT",
        side: "SELL",
        strike: new Decimal("39.45"),
        quantity: 200,
        entryPremium: new Decimal("0.69"),
        simulatedClosingPrice: new Decimal("0.2"),
      }),
      breakeven: "40.75",
    },
    {
      name: "BULL_CALL",
      long: operation({
        id: "bull-call-long",
        optionType: "CALL",
        side: "BUY",
        strike: new Decimal("39.45"),
        quantity: 200,
        entryPremium: new Decimal("1.64"),
        simulatedClosingPrice: new Decimal("1.2"),
      }),
      short: operation({
        id: "bull-call-short",
        optionType: "CALL",
        side: "SELL",
        strike: new Decimal("41.70"),
        quantity: 200,
        entryPremium: new Decimal("0.69"),
        simulatedClosingPrice: new Decimal("0.2"),
      }),
      breakeven: "40.4",
    },
  ])("calculates remaining spread limits and captured profit for $name", async ({
    name,
    long,
    short,
    breakeven,
  }) => {
    const result = await new StrategyService(
      prismaMock([long, short]) as any,
    ).getById(strategyId);

    expect(result.spreadAnalysis).toMatchObject({
      status: "supported",
      strategyType: name,
      maxProfit: "260",
      maxLoss: "190",
      breakeven,
    });
    expect(result.realizedResult).toBe("0");
    expect(result.estimatedOpenResult).toBe("10");
    expect(result.maxProfitCapturedPercentage).toBe(
      "3.8461538461538461538",
    );
  });

  it("calculates captured profit from only open P&L after a balanced partial close", async () => {
    const long = operation({
      id: "bear-put-long",
      side: "BUY",
      strike: new Decimal("41.70"),
      quantity: 200,
      entryPremium: new Decimal("1.64"),
      simulatedClosingPrice: new Decimal("1.2"),
      closures: [closure("bear-put-long", 100, "0.8", "2026-02-01")],
    });
    const short = operation({
      id: "bear-put-short",
      side: "SELL",
      strike: new Decimal("39.45"),
      quantity: 200,
      entryPremium: new Decimal("0.69"),
      simulatedClosingPrice: new Decimal("0.2"),
      closures: [closure("bear-put-short", 100, "0.4", "2026-02-01")],
    });
    const result = await new StrategyService(
      prismaMock([long, short]) as any,
    ).getById(strategyId);

    expect(result.status).toBe("PARTIALLY_CLOSED");
    expect(result.realizedResult).toBe("-55");
    expect(result.estimatedOpenResult).toBe("5");
    expect(result.result).toBe("-50");
    expect(result.spreadAnalysis).toMatchObject({
      status: "supported",
      maxProfit: "130",
    });
    expect(result.maxProfitCapturedPercentage).toBe(
      "3.8461538461538461538",
    );
  });

  it("shows paired and residual quantities without intact-spread limits", async () => {
    const long = operation({
      id: "bear-put-long",
      side: "BUY",
      strike: new Decimal("41.70"),
      quantity: 200,
      entryPremium: new Decimal("1.64"),
    });
    const short = operation({
      id: "bear-put-short",
      side: "SELL",
      strike: new Decimal("39.45"),
      quantity: 200,
      entryPremium: new Decimal("0.69"),
      closures: [closure("bear-put-short", 50, "0.4", "2026-02-01")],
    });
    const result = await new StrategyService(
      prismaMock([long, short]) as any,
    ).getById(strategyId);

    expect(result.operations[0]).toMatchObject({
      protectedQuantity: 150,
      unprotectedQuantity: 50,
    });
    expect(result.operations[1]).toMatchObject({
      protectedQuantity: 150,
      unprotectedQuantity: 0,
    });
    expect(result.spreadAnalysis).toMatchObject({ status: "unsupported" });
    expect(result.maxProfitCapturedPercentage).toBeNull();
  });

  it("reports zero captured profit when estimated open P&L is exactly zero", async () => {
    const long = operation({
      id: "zero-bear-put-long",
      side: "BUY",
      strike: new Decimal("41.70"),
      quantity: 200,
      entryPremium: new Decimal("1.64"),
      simulatedClosingPrice: new Decimal("1.64"),
    });
    const short = operation({
      id: "zero-bear-put-short",
      side: "SELL",
      strike: new Decimal("39.45"),
      quantity: 200,
      entryPremium: new Decimal("0.69"),
      simulatedClosingPrice: new Decimal("0.69"),
    });
    const result = await new StrategyService(
      prismaMock([long, short]) as any,
    ).getById(strategyId);

    expect(result.estimatedOpenResult).toBe("0");
    expect(result.maxProfitCapturedPercentage).toBe("0");
  });

  it("omits captured profit when estimated open P&L is negative", async () => {
    const long = operation({
      id: "negative-bear-put-long",
      side: "BUY",
      strike: new Decimal("41.70"),
      quantity: 200,
      entryPremium: new Decimal("1.64"),
      simulatedClosingPrice: new Decimal("0.5"),
    });
    const short = operation({
      id: "negative-bear-put-short",
      side: "SELL",
      strike: new Decimal("39.45"),
      quantity: 200,
      entryPremium: new Decimal("0.69"),
      simulatedClosingPrice: new Decimal("0.2"),
    });
    const result = await new StrategyService(
      prismaMock([long, short]) as any,
    ).getById(strategyId);

    expect(result.estimatedOpenResult).toBe("-130");
    expect(result.maxProfitCapturedPercentage).toBeNull();
  });

  it("does not dissociate a strategy leg after its first closure", async () => {
    const closed = operation({
      closures: [closure(operationId, 20, "0.5", "2026-02-01")],
    });
    const service = new StrategyService(prismaMock([closed]) as any);

    await expect(service.removeOperation(strategyId, operationId)).rejects.toMatchObject({
      code: "OPERATION_CLOSED",
    });
    await expect(service.remove(strategyId)).rejects.toMatchObject({
      code: "OPERATION_CLOSED",
    });
  });
});
