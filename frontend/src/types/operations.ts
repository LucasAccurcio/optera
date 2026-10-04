export type OperationStatus = "OPEN" | "PARTIALLY_CLOSED" | "CLOSED";
export type OptionType = "CALL" | "PUT";
export type OperationSide = "BUY" | "SELL";

export interface OperationClosure {
  id: string;
  operationId: string;
  quantity: number;
  actualClosingPrice: string;
  closedAt: string;
  createdAt: string;
}

export interface Operation {
  id: string;
  asset: string;
  optionTicker: string;
  optionType: OptionType;
  side: OperationSide;
  expirationDate: string;
  strike: string;
  quantity: number;
  closedQuantity: number;
  openQuantity: number;
  openedAt: string;
  entryPremium: string;
  simulatedClosingPrice: string;
  closures: OperationClosure[];
  strategyId: string | null;
  notes: string | null;
  status: OperationStatus;
  totalPremium: string;
  realizedResult: string;
  estimatedOpenResult: string;
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

export interface OperationCloseInput {
  quantity: number;
  closedAt: string;
  actualClosingPrice: string;
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
