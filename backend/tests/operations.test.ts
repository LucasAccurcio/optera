import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/shared/errors.js";
import { OperationService } from "../src/modules/operations/service.js";

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1",
    asset: "BBSE3",
    optionTicker: "BBSEV436",
    optionType: "PUT",
    side: "SELL",
    expirationDate: new Date("2026-12-18T00:00:00.000Z"),
    strike: new Decimal("40"),
    quantity: 100,
    openedAt: new Date("2026-01-10T00:00:00.000Z"),
    entryPremium: new Decimal("1"),
    simulatedClosingPrice: new Decimal("0.4"),
    closures: [] as Array<ReturnType<typeof closure>>,
    strategyId: null,
    notes: null,
    createdAt: new Date("2026-01-10T12:00:00.000Z"),
    updatedAt: new Date("2026-01-10T12:00:00.000Z"),
    ...overrides,
  };
}

function closure(overrides: Record<string, unknown> = {}) {
  return {
    id: "closure-id",
    operationId: "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1",
    quantity: 100,
    actualClosingPrice: new Decimal("0.5"),
    closedAt: new Date("2026-02-01T00:00:00.000Z"),
    createdAt: new Date("2026-02-01T12:00:00.000Z"),
    ...overrides,
  };
}

function prismaMock(initial: any = operation()) {
  const records: any[] = Array.isArray(initial) ? initial : [initial];
  let closureSequence = 0;

  const matches = (item: any, where: any = {}) => {
    if (where.asset?.contains &&
      !item.asset.toLowerCase().includes(where.asset.contains.toLowerCase()))
      return false;
    if (where.optionType && item.optionType !== where.optionType) return false;
    if (where.side && item.side !== where.side) return false;
    if (where.strategyId === null && item.strategyId !== null) return false;
    if (where.strategyId && item.strategyId !== where.strategyId) return false;
    return true;
  };

  const operationDelegate = {
    create: async ({ data }: any) => {
      const created = operation({ ...data, id: "new-operation-id", closures: [] });
      records.push(created);
      return created;
    },
    findUnique: async ({ where }: any) =>
      records.find((item) => item.id === where.id) ?? null,
    update: async ({ where, data }: any) => {
      const current = records.find((item) => item.id === where.id)!;
      Object.assign(current, data);
      return current;
    },
    delete: async ({ where }: any) => {
      const index = records.findIndex((item) => item.id === where.id);
      const [removed] = records.splice(index, 1);
      return removed;
    },
    findMany: async ({ where, skip, take }: any) => {
      const found = records.filter((item) => matches(item, where));
      return skip === undefined && take === undefined
        ? found
        : found.slice(skip ?? 0, (skip ?? 0) + (take ?? found.length));
    },
    count: async ({ where }: any) => records.filter((item) => matches(item, where)).length,
  };

  const operationClosureDelegate = {
    create: async ({ data }: any) => {
      const current = records.find((item) => item.id === data.operationId)!;
      const created = {
        id: `closure-${++closureSequence}`,
        ...data,
        createdAt: new Date("2026-02-01T12:00:00.000Z"),
      };
      current.closures ??= [];
      current.closures.push(created);
      return created;
    },
  };

  let transactionTail = Promise.resolve();
  const $transaction = async (callback: any) => {
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    const previous = transactionTail;
    transactionTail = previous.then(() => lock);
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
  };
}

describe("operation service", () => {
  it("calculates the initial simulated price when creating", async () => {
    const prisma = prismaMock();
    const service = new OperationService(prisma as any);
    const result = await service.create({
      asset: "PETR4",
      optionTicker: "PETRX123",
      optionType: "CALL",
      side: "BUY",
      expirationDate: "2026-12-18",
      strike: "30",
      quantity: 10,
      openedAt: "2026-01-10",
      entryPremium: "2",
    });
    expect(result.simulatedClosingPrice).toBe("3.2");
    expect(result.status).toBe("OPEN");
  });

  it("does not allow editing an operation after any quantity is closed", async () => {
    const prisma = prismaMock(
      operation({
        closures: [closure({ quantity: 20 })],
      }),
    );
    const service = new OperationService(prisma as any);
    await expect(
      service.update("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", { entryPremium: "1.2" }),
    ).rejects.toMatchObject({ code: "OPERATION_CLOSED" });
  });

  it("allows changing the option type on an open operation", async () => {
    const prisma = prismaMock(operation({ optionType: "CALL" }));
    const service = new OperationService(prisma as any);
    const result = await service.update(
      "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1",
      { optionType: "PUT" },
    );

    expect(result.optionType).toBe("PUT");
  });

  it("returns financial values as strings and applies filters with pagination", async () => {
    const prisma = prismaMock();
    const service = new OperationService(prisma as any);
    const result = await service.list({
      status: "OPEN",
      asset: "bbse",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      entryPremium: "1",
      totalPremium: "100",
      result: "60",
      resultPercentage: "0.6",
    });
  });

  it("lists only open operations that are not associated with a strategy", async () => {
    const prisma = prismaMock();
    const associated = operation({
      id: "6f6d8d13-5e23-4f64-8e38-08ea34a1f2d1",
      strategyId: "7f6d8d13-5e23-4f64-8e38-08ea34a1f2d1",
    });
    prisma.operation.findMany = async ({ where, take }: any) =>
      [operation(), associated]
        .filter((item) => where.strategyId === null && item.strategyId === null)
        .slice(0, take);
    prisma.operation.count = async ({ where }: any) =>
      [operation(), associated].filter(
        (item) => where.strategyId === null && item.strategyId === null,
      )
        .length;

    const service = new OperationService(prisma as any);
    const result = await service.listAvailableForStrategy();

    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].strategyId).toBeNull();
  });

  it("returns a not found error for missing operations", async () => {
    const service = new OperationService(prismaMock() as any);
    await expect(
      service.getById("00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("closes an open operation using the effective closing price and quantity", async () => {
    const prisma = prismaMock();
    const service = new OperationService(prisma as any);
    const result = await service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 100,
      closedAt: "2026-02-01",
      actualClosingPrice: "0.5",
    });
    expect(result.status).toBe("CLOSED");
    expect(result.closedQuantity).toBe(100);
    expect(result.openQuantity).toBe(0);
    expect(result.closures).toHaveLength(1);
    expect(result.closures[0].actualClosingPrice).toBe("0.5");
    expect(result.realizedResult).toBe("50");
    expect(result.estimatedOpenResult).toBe("0");
    expect(result.result).toBe("50");
  });

  it("rejects closing before opening or closing twice", async () => {
    const prisma = prismaMock();
    const service = new OperationService(prisma as any);
    await expect(
      service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
        quantity: 100,
        closedAt: "2025-12-01",
        actualClosingPrice: "0.5",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const closedPrisma = prismaMock(
      operation({
        closures: [closure({
          quantity: 100,
          closedAt: new Date("2026-02-01T00:00:00.000Z"),
          actualClosingPrice: new Decimal("0.5"),
        })],
      }),
    );
    await expect(
      new OperationService(closedPrisma as any).close(
        "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1",
        {
          quantity: 1,
          closedAt: "2026-02-02",
          actualClosingPrice: "0.4",
        },
      ),
    ).rejects.toMatchObject({ code: "OPERATION_CLOSED" });
  });

  it("tracks realized and estimated P&L for a partially closed operation", async () => {
    const service = new OperationService(prismaMock() as any);
    const result = await service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 40,
      closedAt: "2026-02-01",
      actualClosingPrice: "0.5",
    });

    expect(result.status).toBe("PARTIALLY_CLOSED");
    expect(result.closedQuantity).toBe(40);
    expect(result.openQuantity).toBe(60);
    expect(result.closures).toHaveLength(1);
    expect(result.realizedResult).toBe("20");
    expect(result.estimatedOpenResult).toBe("36");
    expect(result.result).toBe("56");
  });

  it("preserves separate closure prices and dates until the operation is fully closed", async () => {
    const service = new OperationService(prismaMock() as any);
    await service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 40,
      closedAt: "2026-02-01",
      actualClosingPrice: "0.5",
    });
    const result = await service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 60,
      closedAt: "2026-02-03",
      actualClosingPrice: "0.25",
    });

    expect(result.status).toBe("CLOSED");
    expect(result.closedQuantity).toBe(100);
    expect(result.openQuantity).toBe(0);
    expect(result.closures).toHaveLength(2);
    expect(result.closures.map((item: any) => [
      item.quantity,
      item.actualClosingPrice,
      item.closedAt,
    ])).toEqual([
      [40, "0.5", "2026-02-01"],
      [60, "0.25", "2026-02-03"],
    ]);
    expect(result.realizedResult).toBe("65");
    expect(result.estimatedOpenResult).toBe("0");
  });

  it.each([0, -1, 1.5])("rejects invalid closure quantity %s", async (quantity) => {
    const service = new OperationService(prismaMock() as any);
    await expect(service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity,
      closedAt: "2026-02-01",
      actualClosingPrice: "0.5",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it.each(["-0.5", "invalid"])("rejects invalid actual closing price %s", async (actualClosingPrice) => {
    const service = new OperationService(prismaMock() as any);
    await expect(service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 10,
      closedAt: "2026-02-01",
      actualClosingPrice,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a closure quantity above the remaining balance", async () => {
    const service = new OperationService(prismaMock() as any);
    await service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 60,
      closedAt: "2026-02-01",
      actualClosingPrice: "0.5",
    });

    await expect(service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 41,
      closedAt: "2026-02-02",
      actualClosingPrice: "0.4",
    })).rejects.toMatchObject({ code: "CLOSURE_QUANTITY_EXCEEDS_OPEN", statusCode: 409 });
  });

  it("protects payoff fields and closure history after the first closure", async () => {
    const prisma = prismaMock();
    const service = new OperationService(prisma as any);
    const partial = await service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 20,
      closedAt: "2026-02-01",
      actualClosingPrice: "0.5",
    });
    const closureBeforeUpdate = partial.closures[0];

    await expect(service.update("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      entryPremium: "2",
    } as any)).rejects.toMatchObject({ code: "OPERATION_CLOSED" });
    await expect(service.remove("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1"))
      .rejects.toMatchObject({ code: "OPERATION_CLOSED" });

    const after = await service.getById("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1");
    expect(after.closures).toEqual([closureBeforeUpdate]);
  });

  it("simulates only the open remainder and preserves realized closures", async () => {
    const service = new OperationService(prismaMock() as any);
    await service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      quantity: 25,
      closedAt: "2026-02-01",
      actualClosingPrice: "0.5",
    });
    const updated = await service.updateSimulation(
      "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1",
      "0.6",
    );

    expect(updated.closedQuantity).toBe(25);
    expect(updated.openQuantity).toBe(75);
    expect(updated.realizedResult).toBe("12.5");
    expect(updated.estimatedOpenResult).toBe("30");
    expect(updated.result).toBe("42.5");
    expect(updated.closures[0].actualClosingPrice).toBe("0.5");
  });

  it("serializes concurrent closes and rejects an amount above the remaining quantity", async () => {
    const prisma = prismaMock();
    const service = new OperationService(prisma as any);
    const results = await Promise.allSettled([
      service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
        quantity: 60,
        closedAt: "2026-02-01",
        actualClosingPrice: "0.5",
      }),
      service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
        quantity: 60,
        closedAt: "2026-02-02",
        actualClosingPrice: "0.4",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const stored = await prisma.operation.findUnique({
      where: { id: "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1" },
    });
    expect(stored.closures.reduce((sum: number, item: any) => sum + item.quantity, 0)).toBe(60);
  });

  it("filters and paginates after deriving partially closed status", async () => {
    const first = operation({ id: "10000000-0000-0000-0000-000000000001" });
    first.closures = [closure({ operationId: first.id, quantity: 20 })];
    const second = operation({ id: "10000000-0000-0000-0000-000000000002", asset: "PETR4" });
    second.closures = [closure({ operationId: second.id, quantity: 30 })];
    const closed = operation({ id: "10000000-0000-0000-0000-000000000003" });
    closed.closures = [closure({ operationId: closed.id, quantity: 100 })];
    const result = await new OperationService(prismaMock([first, second, closed]) as any).list({
      status: "PARTIALLY_CLOSED",
      page: 2,
      pageSize: 1,
      sortBy: "asset",
      sortOrder: "asc",
    });

    expect(result.meta.total).toBe(2);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].asset).toBe("PETR4");
    expect(result.data[0].status).toBe("PARTIALLY_CLOSED");
  });
});
