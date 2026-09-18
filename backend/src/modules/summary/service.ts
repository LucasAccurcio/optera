import type { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import {
  calculateOperationResult,
  calculateTotalPremium,
} from "../../shared/financial/index.js";

export interface SummaryResult {
  openOperations: number;
  closedOperations: number;
  realizedResult: string;
  simulatedResult: string;
  profitableOperations: number;
  lossMakingOperations: number;
  totalPremiumReceived: string;
  totalPremiumPaid: string;
}

export class SummaryService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(): Promise<SummaryResult> {
    const operations = await this.prisma.operation.findMany({
      select: {
        side: true,
        entryPremium: true,
        quantity: true,
        simulatedClosingPrice: true,
        closedAt: true,
        actualClosingPrice: true,
      },
    });
    let realizedResult = new Decimal(0);
    let simulatedResult = new Decimal(0);
    let totalPremiumReceived = new Decimal(0);
    let totalPremiumPaid = new Decimal(0);
    let profitableOperations = 0;
    let lossMakingOperations = 0;

    for (const operation of operations) {
      const totalPremium = calculateTotalPremium(
        operation.entryPremium.toString(),
        operation.quantity,
      );
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

      if (operation.side === "SELL")
        totalPremiumReceived = totalPremiumReceived.plus(totalPremium);
      else totalPremiumPaid = totalPremiumPaid.plus(totalPremium);
      if (operation.closedAt) realizedResult = realizedResult.plus(result);
      else simulatedResult = simulatedResult.plus(result);
      if (result.isPositive()) profitableOperations += 1;
      if (result.isNegative()) lossMakingOperations += 1;
    }

    return {
      openOperations: operations.filter((operation) => !operation.closedAt)
        .length,
      closedOperations: operations.filter((operation) =>
        Boolean(operation.closedAt),
      ).length,
      realizedResult: realizedResult.toString(),
      simulatedResult: simulatedResult.toString(),
      profitableOperations,
      lossMakingOperations,
      totalPremiumReceived: totalPremiumReceived.toString(),
      totalPremiumPaid: totalPremiumPaid.toString(),
    };
  }
}
