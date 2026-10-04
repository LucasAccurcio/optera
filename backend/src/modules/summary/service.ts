import type { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import {
  calculateResult,
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
        closures: {
          select: {
            quantity: true,
            actualClosingPrice: true,
          },
        },
      },
    });
    let realizedResult = new Decimal(0);
    let simulatedResult = new Decimal(0);
    let totalPremiumReceived = new Decimal(0);
    let totalPremiumPaid = new Decimal(0);
    let profitableOperations = 0;
    let lossMakingOperations = 0;
    let openOperations = 0;
    let closedOperations = 0;

    for (const operation of operations) {
      const totalPremium = calculateTotalPremium(
        operation.entryPremium.toString(),
        operation.quantity,
      );
      const closures = operation.closures ?? [];
      const closedQuantity = closures.reduce(
        (total, closure) => total + closure.quantity,
        0,
      );
      if (closedQuantity > operation.quantity) {
        throw new Error("Closed quantity exceeds initial operation quantity");
      }
      const openQuantity = operation.quantity - closedQuantity;
      const realized = closures.reduce(
        (total, closure) => total.plus(calculateResult(
          operation.side,
          operation.entryPremium.toString(),
          closure.actualClosingPrice.toString(),
          closure.quantity,
        )),
        new Decimal(0),
      );
      const estimated = openQuantity > 0
        ? calculateResult(
          operation.side,
          operation.entryPremium.toString(),
          operation.simulatedClosingPrice.toString(),
          openQuantity,
        )
        : new Decimal(0);
      const result = realized.plus(estimated);

      if (operation.side === "SELL")
        totalPremiumReceived = totalPremiumReceived.plus(totalPremium);
      else totalPremiumPaid = totalPremiumPaid.plus(totalPremium);
      realizedResult = realizedResult.plus(realized);
      simulatedResult = simulatedResult.plus(estimated);
      if (openQuantity > 0) openOperations += 1;
      else closedOperations += 1;
      if (result.greaterThan(0)) profitableOperations += 1;
      if (result.isNegative()) lossMakingOperations += 1;
    }

    return {
      openOperations,
      closedOperations,
      realizedResult: realizedResult.toString(),
      simulatedResult: simulatedResult.toString(),
      profitableOperations,
      lossMakingOperations,
      totalPremiumReceived: totalPremiumReceived.toString(),
      totalPremiumPaid: totalPremiumPaid.toString(),
    };
  }
}
