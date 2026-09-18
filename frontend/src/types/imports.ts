export interface ImportPreviewOperation {
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

export interface ImportReport {
  imported: number;
  ignored: number;
  rejected: number;
  preview: Array<{ row: number; operation: ImportPreviewOperation }>;
  errors: Array<{ row: number; reason: string }>;
  committed: boolean;
}
