import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { SummaryService } from "../src/modules/summary/service.js";

describe("summary service", () => {
  it("consolidates open and closed results and premiums", async () => {
    const prisma = {
      operation: {
        findMany: async () => [
          {
            side: "SELL",
            entryPremium: new Decimal("1"),
            quantity: 100,
            simulatedClosingPrice: new Decimal("0.4"),
            closedAt: null,
            actualClosingPrice: null,
          },
          {
            side: "BUY",
            entryPremium: new Decimal("2"),
            quantity: 50,
            simulatedClosingPrice: new Decimal("3.2"),
            closedAt: new Date("2026-02-01T00:00:00.000Z"),
            actualClosingPrice: new Decimal("2.5"),
          },
          {
            side: "BUY",
            entryPremium: new Decimal("1"),
            quantity: 10,
            simulatedClosingPrice: new Decimal("0.5"),
            closedAt: null,
            actualClosingPrice: null,
          },
        ],
      },
    };
    const result = await new SummaryService(prisma as any).getSummary();
    expect(result.openOperations).toBe(2);
    expect(result.closedOperations).toBe(1);
    expect(result.simulatedResult).toBe("55");
    expect(result.realizedResult).toBe("25");
    expect(result.profitableOperations).toBe(2);
    expect(result.lossMakingOperations).toBe(1);
    expect(result.totalPremiumReceived).toBe("100");
    expect(result.totalPremiumPaid).toBe("110");
  });

  it("returns zero values when there are no operations", async () => {
    const result = await new SummaryService({
      operation: { findMany: async () => [] },
    } as any).getSummary();
    expect(result).toEqual({
      openOperations: 0,
      closedOperations: 0,
      realizedResult: "0",
      simulatedResult: "0",
      profitableOperations: 0,
      lossMakingOperations: 0,
      totalPremiumReceived: "0",
      totalPremiumPaid: "0",
    });
  });
});
