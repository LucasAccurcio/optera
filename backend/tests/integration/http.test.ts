import { randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

function makeOperation(overrides: Record<string, any> = {}) {
  const now = new Date("2026-01-10T00:00:00.000Z");
  return {
    id: randomUUID(),
    asset: "BBSE3",
    optionTicker: "BBSEV436",
    optionType: "PUT",
    side: "SELL",
    expirationDate: new Date("2026-12-18T00:00:00.000Z"),
    strike: new Decimal("40"),
    quantity: 100,
    openedAt: now,
    entryPremium: new Decimal("1"),
    simulatedClosingPrice: new Decimal("0.4"),
    closures: [],
    strategyId: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDatabase() {
  const operations: any[] = [];
  const strategies: any[] = [];
  const normalizeOperation = (value: any) => ({
    ...value,
    strike: new Decimal(value.strike),
    entryPremium: new Decimal(value.entryPremium),
    simulatedClosingPrice: new Decimal(value.simulatedClosingPrice),
  });
  const withStrategyOperations = (strategy: any) => ({
    ...strategy,
    operations: operations.filter(
      (operation) => operation.strategyId === strategy.id,
    ),
  });
  const findOperation = (id: string) =>
    operations.find((operation) => operation.id === id) ?? null;
  const findStrategy = (id: string) =>
    strategies.find((strategy) => strategy.id === id) ?? null;
  const matches = (operation: any, where: any = {}) => {
    if (
      where.asset &&
      !operation.asset
        .toLowerCase()
        .includes(where.asset.contains.toLowerCase())
    )
      return false;
    if (where.strategyId && operation.strategyId !== where.strategyId)
      return false;
    if (where.optionType && operation.optionType !== where.optionType)
      return false;
    if (where.side && operation.side !== where.side) return false;
    return true;
  };
  const operationDelegate = {
    create: async ({ data }: any) => {
      const created = normalizeOperation({
        ...makeOperation(),
        ...data,
        strategyId: data.strategy?.connect?.id ?? null,
      });
      operations.push(created);
      return created;
    },
    findUnique: async ({ where }: any) => findOperation(where.id),
    findMany: async ({
      where,
      skip = 0,
      take = 100,
      orderBy: _orderBy,
    }: any) =>
      operations
        .filter((operation) => matches(operation, where))
        .slice(skip, skip + take),
    count: async ({ where }: any) =>
      operations.filter((operation) => matches(operation, where)).length,
    update: async ({ where, data }: any) => {
      const operation = findOperation(where.id);
      if (!operation) throw new Error("operation not found");
      const strategyId =
        data.strategy?.connect?.id ??
        (data.strategy?.disconnect ? null : operation.strategyId);
      Object.assign(operation, data, { strategyId });
      for (const key of ["strike", "entryPremium", "simulatedClosingPrice"]) {
        if (operation[key] != null)
          operation[key] = new Decimal(operation[key]);
      }
      return operation;
    },
    delete: async ({ where }: any) => {
      const index = operations.findIndex(
        (operation) => operation.id === where.id,
      );
      const [deleted] = operations.splice(index, 1);
      return deleted;
    },
  };
  const operationClosureDelegate = {
    create: async ({ data }: any) => {
      const operation = findOperation(data.operationId);
      if (!operation) throw new Error("operation not found");
      const created = {
        id: randomUUID(),
        ...data,
        createdAt: new Date("2026-02-01T12:00:00.000Z"),
      };
      operation.closures ??= [];
      operation.closures.push(created);
      return created;
    },
  };
  let transactionTail = Promise.resolve();
  const $transaction = async (callback: any) => {
    let release!: () => void;
    const previous = transactionTail;
    transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await callback({
        operation: operationDelegate,
        operationClosure: operationClosureDelegate,
      });
    } finally {
      release();
    }
  };
  return {
    operation: operationDelegate,
    operationClosure: operationClosureDelegate,
    $transaction,
    strategy: {
      create: async ({ data }: any) => {
        const strategy = {
          id: randomUUID(),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        strategies.push(strategy);
        return withStrategyOperations(strategy);
      },
      findUnique: async ({ where }: any) => {
        const strategy = findStrategy(where.id);
        return strategy ? withStrategyOperations(strategy) : null;
      },
      findMany: async () => strategies.map(withStrategyOperations),
      update: async ({ where, data }: any) => {
        const strategy = findStrategy(where.id);
        if (!strategy) throw new Error("strategy not found");
        Object.assign(strategy, data, { updatedAt: new Date() });
        return withStrategyOperations(strategy);
      },
      delete: async ({ where }: any) => {
        const index = strategies.findIndex(
          (strategy) => strategy.id === where.id,
        );
        const [deleted] = strategies.splice(index, 1);
        for (const operation of operations)
          if (operation.strategyId === where.id) operation.strategyId = null;
        return deleted;
      },
    },
  };
}

describe("HTTP integration", () => {
  const database = makeDatabase();
  const app = buildApp({ withDatabase: false, prisma: database });

  afterAll(async () => {
    await app.close();
  });

  it("runs the operation lifecycle through HTTP", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/operations",
      payload: {
        asset: "BBSE3",
        optionTicker: "BBSEV436",
        optionType: "PUT",
        side: "SELL",
        expirationDate: "2026-12-18",
        strike: "40",
        quantity: 100,
        openedAt: "2026-01-10",
        entryPremium: "1",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.simulatedClosingPrice).toBe("0.4");
    const id = created.json().data.id;

    const listed = await app.inject({
      method: "GET",
      url: "/operations?status=OPEN&asset=bbse3",
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().meta.total).toBe(1);

    const simulated = await app.inject({
      method: "PATCH",
      url: `/operations/${id}/simulation`,
      payload: { simulatedClosingPrice: "0.5" },
    });
    expect(simulated.statusCode).toBe(200);
    expect(simulated.json().data.result).toBe("50");

    const partiallyClosed = await app.inject({
      method: "POST",
      url: `/operations/${id}/close`,
      payload: { quantity: 40, closedAt: "2026-01-20", actualClosingPrice: "0.6" },
    });
    expect(partiallyClosed.statusCode).toBe(200);
    expect(partiallyClosed.json().data.status).toBe("PARTIALLY_CLOSED");
    expect(partiallyClosed.json().data.closedQuantity).toBe(40);
    expect(partiallyClosed.json().data.openQuantity).toBe(60);
    expect(partiallyClosed.json().data.realizedResult).toBe("16");
    expect(partiallyClosed.json().data.estimatedOpenResult).toBe("30");

    const closed = await app.inject({
      method: "POST",
      url: `/operations/${id}/close`,
      payload: { quantity: 60, closedAt: "2026-01-21", actualClosingPrice: "0.4" },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().data.status).toBe("CLOSED");
    expect(closed.json().data.closedQuantity).toBe(100);
    expect(closed.json().data.openQuantity).toBe(0);
    expect(closed.json().data.realizedResult).toBe("52");
    expect(closed.json().data.estimatedOpenResult).toBe("0");
    expect(closed.json().data.result).toBe("52");
  });

  it("creates a multi-leg strategy and exposes its consolidated result", async () => {
    const first = makeOperation({
      side: "SELL",
      entryPremium: new Decimal("1"),
      simulatedClosingPrice: new Decimal("0.4"),
    });
    const second = makeOperation({
      side: "BUY",
      optionTicker: "BBSEV414",
      entryPremium: new Decimal("2"),
      simulatedClosingPrice: new Decimal("2.6"),
    });
    database.operation.create({ data: first });
    database.operation.create({ data: second });
    const strategyResponse = await app.inject({
      method: "POST",
      url: "/strategies",
      payload: {
        name: "Trava de baixa",
        asset: "BBSE3",
        openedAt: "2026-01-10",
      },
    });
    const strategyId = strategyResponse.json().data.id;

    await app.inject({
      method: "POST",
      url: `/strategies/${strategyId}/operations`,
      payload: { operationId: first.id },
    });
    const associated = await app.inject({
      method: "POST",
      url: `/strategies/${strategyId}/operations`,
      payload: { operationId: second.id },
    });
    expect(associated.statusCode).toBe(200);
    expect(associated.json().data.operations).toHaveLength(2);
    expect(associated.json().data.totalPremium).toBe("300");
    expect(associated.json().data.result).toBe("120");
    expect(associated.json().data.resultPercentage).toBe("0.4");
  });

  it("returns validation errors with the standard envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/operations",
      payload: { asset: "BBSE3" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(response.json().error.details.length).toBeGreaterThan(0);
  });
});
