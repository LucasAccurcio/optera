import {
  classifyOption,
  type OptionClassification,
} from "../../shared/market/classification.js";
import {
  calculateDte,
  getDteStatus,
  type DteStatus,
} from "../../shared/market/dte.js";
import type { SupportedVerticalSpreadAnalysis } from "../../shared/financial/vertical-spread.js";

export type StrategyAlertType =
  | "expiration_warning"
  | "expiration_critical"
  | "expired"
  | "leg_itm"
  | "both_legs_itm"
  | "partial_closure";

export type StrategyAlert = {
  type: StrategyAlertType;
  severity: "info" | "warning" | "critical";
  message: string;
  operationId?: string;
  strategyType?: SupportedVerticalSpreadAnalysis["strategyType"];
  dte?: number;
};

export type StrategyAlertLeg = {
  operationId: string;
  asset: string;
  optionTicker: string;
  optionType: "CALL" | "PUT";
  side: "BUY" | "SELL";
  strike: string;
  quantity: number;
  closedQuantity: number;
  openQuantity: number;
  status: "OPEN" | "PARTIALLY_CLOSED" | "CLOSED";
  dte: number | null;
  dteStatus: DteStatus | null;
  moneyness: OptionClassification | null;
  protectedQuantity: number;
  unprotectedQuantity: number;
};

function alertForDte(operationId: string, dte: number, status: DteStatus): StrategyAlert | null {
  if (status === "expired") {
    return {
      type: "expired",
      severity: "critical",
      operationId,
      dte,
      message: "A quantidade ainda aberta chegou ao vencimento.",
    };
  }
  if (status === "critical") {
    return {
      type: "expiration_critical",
      severity: "critical",
      operationId,
      dte,
      message: "A quantidade ainda aberta está próxima do vencimento.",
    };
  }
  if (status === "alert" || status === "attention") {
    return {
      type: "expiration_warning",
      severity: "warning",
      operationId,
      dte,
      message: "A quantidade ainda aberta está se aproximando do vencimento.",
    };
  }
  return null;
}

export function buildStrategyAlertView(
  strategy: any,
  underlyingPrice: string | null,
  currentDate: Date,
  quoteTimestamp: string | null,
) {
  const legs: StrategyAlertLeg[] = strategy.operations.map((operation: any) => {
    const isOpen = operation.openQuantity > 0;
    const dte = isOpen
      ? getDteForOperation(currentDate, operation.expirationDate)
      : null;
    const classification = isOpen && underlyingPrice !== null
      ? classifyOption(operation.optionType, underlyingPrice, operation.strike)
      : null;
    return {
      operationId: operation.id,
      asset: operation.asset,
      optionTicker: operation.optionTicker,
      optionType: operation.optionType,
      side: operation.side,
      strike: operation.strike,
      quantity: operation.quantity,
      closedQuantity: operation.closedQuantity,
      openQuantity: operation.openQuantity,
      status: operation.status,
      dte,
      dteStatus: dte === null ? null : getDteStatus(dte),
      moneyness: classification,
      protectedQuantity: operation.protectedQuantity,
      unprotectedQuantity: operation.unprotectedQuantity,
    };
  });
  const openLegs = legs.filter((leg) => leg.openQuantity > 0);
  const validDtes = openLegs
    .map((leg) => leg.dte)
    .filter((dte): dte is number => dte !== null);
  const minDte = validDtes.length > 0 ? Math.min(...validDtes) : null;
  const minDteStatus = minDte === null ? null : getDteStatus(minDte);
  const expirationStatus = minDteStatus === "expired"
    ? "VENCIDA"
    : minDteStatus?.toUpperCase() ?? null;
  const alerts: StrategyAlert[] = [];

  for (const leg of openLegs) {
    if (leg.dte !== null && leg.dteStatus !== null) {
      const dteAlert = alertForDte(leg.operationId, leg.dte, leg.dteStatus);
      if (dteAlert) alerts.push(dteAlert);
    }
    if (leg.moneyness === "ITM") {
      alerts.push({
        type: "leg_itm",
        severity: "info",
        operationId: leg.operationId,
        message: `A perna ${leg.optionTicker} está ITM.`,
      });
    }
  }

  if (strategy.status === "PARTIALLY_CLOSED") {
    alerts.push({
      type: "partial_closure",
      severity: "warning",
      message: "A estratégia possui quantidades encerradas e quantidades ainda abertas.",
    });
  }

  const analysis = strategy.spreadAnalysis;
  if (
    analysis?.status === "supported" &&
    openLegs.length === 2 &&
    openLegs.every((leg) => leg.moneyness === "ITM")
  ) {
    alerts.push({
      type: "both_legs_itm",
      severity: "warning",
      strategyType: analysis.strategyType,
      message: `Ambas as pernas da estrutura ${analysis.strategyType} estão ITM.`,
    });
  }

  return {
    ...strategy,
    assetPrice: underlyingPrice,
    quoteTimestamp,
    minDte,
    expirationStatus,
    legs,
    alerts,
  };
}

function getDteForOperation(currentDate: Date, expirationDate: string | null): number | null {
  if (!expirationDate) return null;
  return calculateDte(currentDate, expirationDate);
}
