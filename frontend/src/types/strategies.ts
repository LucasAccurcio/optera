import type { OperationSide, OperationStatus, OptionType } from "./operations";

export interface StrategyLeg {
  id: string;
  asset: string;
  optionTicker: string;
  optionType: OptionType;
  side: OperationSide;
  quantity: number;
  strike: string;
  entryPremium: string;
  simulatedClosingPrice: string;
  actualClosingPrice: string | null;
  closedAt: string | null;
  status: OperationStatus;
  totalPremium: string;
  result: string;
  resultPercentage: string;
}

export interface Strategy {
  id: string;
  name: string;
  asset: string;
  type: string | null;
  openedAt: string;
  notes: string | null;
  status: OperationStatus;
  operations: StrategyLeg[];
  totalPremium: string;
  result: string;
  resultPercentage: string;
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
