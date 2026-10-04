import type { Operation, OperationStatus } from "./operations";

export type StrategyType = "BEAR_PUT" | "BULL_CALL";

export type SupportedSpreadAnalysis = {
  status: "supported";
  strategyType: StrategyType;
  lowerStrike: string;
  higherStrike: string;
  quantity: number;
  width: string;
  netDebitPerOption: string;
  netDebitTotal: string;
  maxProfit: string;
  maxLoss: string;
  breakeven: string;
  maxProfitPercentage: string;
  returnRiskRatio: string;
};

export type VerticalSpreadAnalysis =
  | SupportedSpreadAnalysis
  | { status: "unsupported" | "invalid"; reasonCode: string };

export interface StrategyLeg extends Operation {
  protectedQuantity: number;
  unprotectedQuantity: number;
}

export interface Strategy {
  id: string;
  name: string;
  asset: string;
  type: string | null;
  strategyType: StrategyType | null;
  openedAt: string;
  notes: string | null;
  status: OperationStatus;
  operations: StrategyLeg[];
  spreadAnalysis: VerticalSpreadAnalysis | null;
  totalPremium: string;
  realizedResult: string;
  estimatedOpenResult: string;
  result: string;
  resultPercentage: string;
  maxProfitCapturedPercentage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyInput {
  name: string;
  asset: string;
  type?: string | null;
  openedAt: string;
  notes?: string | null;
}

export type StrategyAlertType =
  | "expiration_warning"
  | "expiration_critical"
  | "expired"
  | "leg_itm"
  | "both_legs_itm"
  | "partial_closure";

export interface StrategyAlert {
  type: StrategyAlertType;
  severity: "info" | "warning" | "critical";
  message: string;
  operationId?: string;
  strategyType?: StrategyType;
  dte?: number;
}

export interface StrategyAlertLeg {
  operationId: string;
  asset: string;
  optionTicker: string;
  optionType: "CALL" | "PUT";
  side: "BUY" | "SELL";
  strike: string;
  quantity: number;
  closedQuantity: number;
  openQuantity: number;
  status: OperationStatus;
  dte: number | null;
  dteStatus: "expired" | "critical" | "alert" | "attention" | "normal" | null;
  moneyness: "ITM" | "ATM" | "OTM" | null;
  protectedQuantity: number;
  unprotectedQuantity: number;
}

export interface StrategyAlerts extends Strategy {
  assetPrice: string | null;
  quoteTimestamp: string | null;
  minDte: number | null;
  expirationStatus: string | null;
  legs: StrategyAlertLeg[];
  alerts: StrategyAlert[];
}

export type StrategyCloseLegInput = {
  operationId: string;
  quantity: number;
  actualClosingPrice: string;
  closedAt: string;
};

export interface StrategySimulation {
  strategyId: string;
  asset: string;
  assetPrice: string | null;
  strategyType: StrategyType | null;
  scenario: "above_max" | "between" | "below_min" | null;
  result: string | null;
  maxProfit: string | null;
  maxLoss: string | null;
  breakeven: string | null;
}
