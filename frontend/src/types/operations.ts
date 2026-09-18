export type OperationStatus = "OPEN" | "CLOSED";
export type OptionType = "CALL" | "PUT";
export type OperationSide = "BUY" | "SELL";

export interface Operation {
  id: string;
  asset: string;
  optionTicker: string;
  optionType: OptionType;
  side: OperationSide;
  expirationDate: string;
  strike: string;
  quantity: number;
  openedAt: string;
  entryPremium: string;
  simulatedClosingPrice: string;
  closedAt: string | null;
  actualClosingPrice: string | null;
  strategyId: string | null;
  notes: string | null;
  status: OperationStatus;
  totalPremium: string;
  result: string;
  resultPercentage: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationInput {
  asset: string;
  optionTicker: string;
  optionType: OptionType;
  side: OperationSide;
  expirationDate: string;
  strike: string;
  quantity: number;
  openedAt: string;
  entryPremium: string;
  strategyId?: string | null;
  notes?: string | null;
}

export interface OperationFilters {
  status: "ALL" | OperationStatus;
  asset: string;
  optionType: "" | OptionType;
  side: "" | OperationSide;
  strategyId: string;
}

export interface QuoteView {
  asset: string;
  price: string | null;
  timestamp: string | null;
  source: string;
  delayed: boolean;
  lastError: string | null;
}

export interface QuoteWarning {
  code: string;
  message: string;
  asset?: string;
}

export interface QuoteResponse {
  data: QuoteView[];
  updatedAt: string | null;
  warnings: QuoteWarning[];
}
