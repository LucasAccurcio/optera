import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseOperationsWorkbook } from "../src/modules/imports/parser.js";
import { ImportService } from "../src/modules/imports/service.js";

function workbook(rows: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  return XLSX.write({ SheetNames: ["Operações"], Sheets: { Operações: sheet } }, { type: "buffer", bookType: "xlsx" });
}

const headers = ["Ativo", "Ticket", "Operação", "Tipo (CALL/PUT)", "Vencimento", "Strike", "Qtd (opções)", "Data Início", "Prêmio (R$/opção)", "Data Encerramento", "Preço Encerramento\n(R$/opção)", "Observação"];

describe("operations import", () => {
  it("maps Excel dates and ignores empty rows", () => {
    const parsed = parseOperationsWorkbook(workbook([headers, ["BBSE3", "BBSEV436", "Venda", "PUT", new Date("2026-12-18T00:00:00Z"), 40, 100, new Date("2026-01-10T00:00:00Z"), 1, null, null, "planilha"], [null, null], ["PETR4", "PETRX1", "Compra", "CALL", "2026-12-18", 30, 10, "2026-01-10", "2,50", "2026-02-01", "2,80", null]]));
    expect(parsed.operations).toHaveLength(2);
    expect(parsed.operations[0].operation).toMatchObject({ optionType: "PUT", side: "SELL", expirationDate: "2026-12-18", openedAt: "2026-01-10", entryPremium: "1" });
    expect(parsed.operations[1].operation).toMatchObject({ side: "BUY", closedAt: "2026-02-01", actualClosingPrice: "2.8" });
    expect(parsed.ignoredRows).toEqual([3]);
  });

  it("reports the original row and reason for invalid data", () => {
    const parsed = parseOperationsWorkbook(workbook([headers, ["BBSE3", "", "Venda", "PUT", "2026-12-18", 40, 0, "2026-01-10", 1]]));
    expect(parsed.issues).toEqual([{ row: 2, reason: "Ativo and Ticket are required" }]);
  });

  it("does not insert invalid imports and calculates simulated prices on commit", async () => {
    const created: any[] = [];
    const prisma = {
      operation: { findMany: async () => [], create: async ({ data }: any) => { created.push(data); return data; } },
      $transaction: async (callback: any) => callback({ operation: { create: async ({ data }: any) => { created.push(data); return data; } } }),
    };
    const service = new ImportService(prisma as any);
    const result = await service.commit(workbook([headers, ["BBSE3", "BBSEV436", "Venda", "PUT", "2026-12-18", 40, 100, "2026-01-10", 1]]));
    expect(result.committed).toBe(true);
    expect(created[0]).toMatchObject({ simulatedClosingPrice: "0.4", strategy: undefined });
    expect(created[0].closedAt).toBeUndefined();
  });
});
