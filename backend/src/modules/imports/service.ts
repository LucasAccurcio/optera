import type { PrismaClient } from "@prisma/client";
import { calculateInitialClosingPrice } from "../../shared/financial/index.js";
import { AppError } from "../../shared/errors.js";
import {
  operationFingerprint,
  parseOperationsWorkbook,
  type ImportedOperation,
} from "./parser.js";

export interface ImportReport {
  imported: number;
  ignored: number;
  rejected: number;
  preview: Array<{ row: number; operation: ImportedOperation }>;
  errors: Array<{ row: number; reason: string }>;
  committed: boolean;
}

function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toCreateData(operation: ImportedOperation) {
  return {
    asset: operation.asset,
    optionTicker: operation.optionTicker,
    optionType: operation.optionType,
    side: operation.side,
    expirationDate: dateValue(operation.expirationDate),
    strike: operation.strike,
    quantity: operation.quantity,
    openedAt: dateValue(operation.openedAt),
    entryPremium: operation.entryPremium,
    simulatedClosingPrice: calculateInitialClosingPrice(
      operation.side,
      operation.entryPremium,
    ).toString(),
    ...(operation.closedAt
      ? {
          closedAt: dateValue(operation.closedAt),
          actualClosingPrice: operation.actualClosingPrice,
        }
      : {}),
    notes: operation.notes ?? null,
  };
}

export class ImportService {
  constructor(private readonly prisma: PrismaClient) {}

  private async analyze(
    buffer: Buffer,
  ): Promise<{ report: ImportReport; operations: ImportedOperation[] }> {
    const parsed = parseOperationsWorkbook(buffer);
    const existing = await this.prisma.operation.findMany({
      select: {
        asset: true,
        optionTicker: true,
        optionType: true,
        side: true,
        expirationDate: true,
        strike: true,
        quantity: true,
        openedAt: true,
        entryPremium: true,
        closedAt: true,
        actualClosingPrice: true,
      },
    });
    const existingFingerprints = new Set(
      existing.map((operation: any) =>
        operationFingerprint({
          asset: operation.asset,
          optionTicker: operation.optionTicker,
          optionType: operation.optionType,
          side: operation.side,
          expirationDate: operation.expirationDate.toISOString().slice(0, 10),
          strike: operation.strike.toString(),
          quantity: operation.quantity,
          openedAt: operation.openedAt.toISOString().slice(0, 10),
          entryPremium: operation.entryPremium.toString(),
          ...(operation.closedAt
            ? {
                closedAt: operation.closedAt.toISOString().slice(0, 10),
                actualClosingPrice: operation.actualClosingPrice.toString(),
              }
            : {}),
        }),
      ),
    );
    const seen = new Set(existingFingerprints);
    const accepted: Array<{ row: number; operation: ImportedOperation }> = [];
    let ignored = parsed.ignoredRows.length;
    for (const candidate of parsed.operations) {
      if (seen.has(candidate.fingerprint)) ignored += 1;
      else {
        seen.add(candidate.fingerprint);
        accepted.push({ row: candidate.row, operation: candidate.operation });
      }
    }
    return {
      operations: accepted.map((item) => item.operation),
      report: {
        imported: accepted.length,
        ignored,
        rejected: parsed.issues.length,
        preview: accepted,
        errors: parsed.issues,
        committed: false,
      },
    };
  }

  async preview(buffer: Buffer): Promise<ImportReport> {
    return (await this.analyze(buffer)).report;
  }

  async commit(buffer: Buffer): Promise<ImportReport> {
    const analyzed = await this.analyze(buffer);
    if (analyzed.report.rejected > 0)
      throw new AppError(
        "IMPORT_VALIDATION_FAILED",
        "The workbook contains invalid rows",
        422,
        analyzed.report.errors,
      );
    await this.prisma.$transaction(async (transaction) => {
      for (const operation of analyzed.operations)
        await transaction.operation.create({
          data: toCreateData(operation) as any,
        });
    });
    return { ...analyzed.report, committed: true };
  }
}
