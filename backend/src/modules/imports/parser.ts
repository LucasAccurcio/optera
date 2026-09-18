import * as XLSX from "xlsx";
import { Decimal } from "decimal.js";
import { AppError } from "../../shared/errors.js";

export interface ImportedOperation {
  asset: string;
  optionTicker: string;
  optionType: "CALL" | "PUT";
  side: "BUY" | "SELL";
  expirationDate: string;
  strike: string;
  quantity: number;
  openedAt: string;
  entryPremium: string;
  closedAt?: string;
  actualClosingPrice?: string;
  notes?: string | null;
}

export interface ImportIssue {
  row: number;
  reason: string;
}

export interface ParsedImport {
  operations: Array<{
    row: number;
    operation: ImportedOperation;
    fingerprint: string;
  }>;
  ignoredRows: number[];
  issues: ImportIssue[];
}

const requiredHeaders = [
  "ativo",
  "ticket",
  "tipo (call/put)",
  "operação",
  "vencimento",
  "strike",
  "qtd (opções)",
  "data início",
  "prêmio (r$/opção)",
];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cell(
  row: unknown[],
  headers: Map<string, number>,
  name: string,
): unknown {
  return row[headers.get(normalizeHeader(name)) ?? -1];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function decimal(value: unknown, field: string): string {
  const raw = text(value)
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  if (!raw) throw new Error(`${field} is required`);
  try {
    const parsed = new Decimal(raw);
    if (!parsed.isFinite() || parsed.isNegative()) throw new Error();
    if (parsed.decimalPlaces() > 6)
      throw new Error(`${field} has more than 6 decimal places`);
    return parsed.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes("more than"))
      throw error;
    throw new Error(`${field} must be a non-negative decimal`);
  }
}

function dateOnly(value: unknown, field: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed)
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  const brazilian = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parts = brazilian
    ? [brazilian[3], brazilian[2], brazilian[1]]
    : iso?.slice(1);
  if (!parts) throw new Error(`${field} must be a valid date`);
  const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== `${parts[0]}-${parts[1]}-${parts[2]}`
  )
    throw new Error(`${field} must be a valid date`);
  return date.toISOString().slice(0, 10);
}

export function operationFingerprint(operation: ImportedOperation): string {
  return [
    operation.asset,
    operation.optionTicker,
    operation.optionType,
    operation.side,
    operation.expirationDate,
    operation.strike,
    operation.quantity,
    operation.openedAt,
    operation.entryPremium,
    operation.closedAt ?? "",
    operation.actualClosingPrice ?? "",
  ]
    .join("|")
    .toLowerCase();
}

export function parseOperationsWorkbook(buffer: Buffer): ParsedImport {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellNF: false,
      cellText: false,
    });
  } catch {
    throw new AppError(
      "INVALID_FILE",
      "The uploaded file is not a valid XLSX workbook",
      400,
    );
  }
  const sheetName = workbook.SheetNames.find(
    (name) => normalizeHeader(name) === "operacoes",
  );
  if (!sheetName)
    throw new AppError(
      "INVALID_FILE",
      "The workbook must contain an Operações sheet",
      400,
    );
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });
  const headerRow = rows[0] ?? [];
  const headers = new Map<string, number>();
  headerRow.forEach((value, index) =>
    headers.set(normalizeHeader(value), index),
  );
  const missing = requiredHeaders.filter(
    (header) => !headers.has(normalizeHeader(header)),
  );
  if (missing.length > 0)
    throw new AppError(
      "INVALID_FILE",
      `Missing required columns: ${missing.join(", ")}`,
      400,
    );

  const operations: ParsedImport["operations"] = [];
  const ignoredRows: number[] = [];
  const issues: ImportIssue[] = [];
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.every((value) => value == null || text(value) === "")) {
      ignoredRows.push(rowNumber);
      return;
    }
    try {
      const type = text(cell(row, headers, "Tipo (CALL/PUT)")).toUpperCase();
      const sideText = text(cell(row, headers, "Operação")).toUpperCase();
      if (type !== "CALL" && type !== "PUT")
        throw new Error("Tipo must be CALL or PUT");
      if (!["COMPRA", "VENDA", "BUY", "SELL"].includes(sideText))
        throw new Error("Operação must be Compra/Venda or BUY/SELL");
      const closedValue = cell(row, headers, "Data Encerramento");
      const actualValue = cell(row, headers, "Preço Encerramento\n(R$/opção)");
      const hasClosed = text(closedValue) !== "" || text(actualValue) !== "";
      if (hasClosed && (text(closedValue) === "" || text(actualValue) === ""))
        throw new Error(
          "Data Encerramento and Preço Encerramento must be provided together",
        );
      const operation: ImportedOperation = {
        asset: text(cell(row, headers, "Ativo")),
        optionTicker: text(cell(row, headers, "Ticket")),
        optionType: type,
        side: sideText === "VENDA" || sideText === "SELL" ? "SELL" : "BUY",
        expirationDate: dateOnly(
          cell(row, headers, "Vencimento"),
          "Vencimento",
        ),
        strike: decimal(cell(row, headers, "Strike"), "Strike"),
        quantity: Number(
          decimal(cell(row, headers, "Qtd (opções)"), "Qtd (opções)"),
        ),
        openedAt: dateOnly(cell(row, headers, "Data Início"), "Data Início"),
        entryPremium: decimal(
          cell(row, headers, "Prêmio (R$/opção)"),
          "Prêmio (R$/opção)",
        ),
        ...(hasClosed
          ? {
              closedAt: dateOnly(closedValue, "Data Encerramento"),
              actualClosingPrice: decimal(actualValue, "Preço Encerramento"),
            }
          : {}),
        notes: text(cell(row, headers, "Observação")) || null,
      };
      if (!operation.asset || !operation.optionTicker)
        throw new Error("Ativo and Ticket are required");
      if (!Number.isInteger(operation.quantity) || operation.quantity <= 0)
        throw new Error("Qtd (opções) must be a positive integer");
      if (operation.closedAt && operation.closedAt < operation.openedAt)
        throw new Error("Data Encerramento cannot be before Data Início");
      operations.push({
        row: rowNumber,
        operation,
        fingerprint: operationFingerprint(operation),
      });
    } catch (error) {
      issues.push({
        row: rowNumber,
        reason: error instanceof Error ? error.message : "Invalid row",
      });
    }
  });
  return { operations, ignoredRows, issues };
}
