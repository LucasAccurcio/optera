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
    closedAt: null,
    actualClosingPrice: null,
    strategyId: null,
    notes: null,
    createdAt: new Date("2026-01-10T12:00:00.000Z"),
    updatedAt: new Date("2026-01-10T12:00:00.000Z"),
    ...overrides,
  };
}

function prismaMock(initial = operation()) {
  const records = [initial];
  return {
    operation: {
      create: async ({ data }: any) => {
        const created = operation({ ...data, id: "new-operation-id" });
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
      findMany: async ({ where, skip, take }: any) =>
        records
          .filter((item: any) => {
            if (where.closedAt === null && item.closedAt !== null) return false;
            if (where.closedAt?.not === null && item.closedAt === null)
              return false;
            if (
              where.asset &&
              !item.asset
                .toLowerCase()
                .includes(where.asset.contains.toLowerCase())
            )
              return false;
            if (where.optionType && item.optionType !== where.optionType)
              return false;
            return true;
          })
          .slice(skip, skip + take),
      count: async ({ where }: any) =>
        records.filter((item: any) => {
          if (where.closedAt === null && item.closedAt !== null) return false;
          if (where.closedAt?.not === null && item.closedAt === null)
            return false;
          if (
            where.asset &&
            !item.asset
              .toLowerCase()
              .includes(where.asset.contains.toLowerCase())
          )
            return false;
          return true;
        }).length,
    },
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

  it("does not allow editing a closed operation", async () => {
    const prisma = prismaMock(
      operation({
        closedAt: new Date("2026-02-01T00:00:00.000Z"),
        actualClosingPrice: new Decimal("0.5"),
      }),
    );
    const service = new OperationService(prisma as any);
    await expect(
      service.update("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", { notes: "edit" }),
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

  it("returns a not found error for missing operations", async () => {
    const service = new OperationService(prismaMock() as any);
    await expect(
      service.getById("00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("closes an open operation using the effective closing price", async () => {
    const prisma = prismaMock();
    const service = new OperationService(prisma as any);
    const result = await service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
      closedAt: "2026-02-01",
      actualClosingPrice: "0.5",
    });
    expect(result.status).toBe("CLOSED");
    expect(result.actualClosingPrice).toBe("0.5");
    expect(result.result).toBe("50");
  });

  it("rejects closing before opening or closing twice", async () => {
    const prisma = prismaMock();
    const service = new OperationService(prisma as any);
    await expect(
      service.close("4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1", {
        closedAt: "2025-12-01",
        actualClosingPrice: "0.5",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const closedPrisma = prismaMock(
      operation({
        closedAt: new Date("2026-02-01T00:00:00.000Z"),
        actualClosingPrice: new Decimal("0.5"),
      }),
    );
    await expect(
      new OperationService(closedPrisma as any).close(
        "4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1",
        {
          closedAt: "2026-02-02",
          actualClosingPrice: "0.4",
        },
      ),
    ).rejects.toMatchObject({ code: "OPERATION_CLOSED" });
  });
});
