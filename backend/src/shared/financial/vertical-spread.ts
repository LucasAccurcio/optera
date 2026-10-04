import { Decimal } from "decimal.js";

export type VerticalSpreadLegInput = {
  asset: string;
  expirationDate: string;
  optionType: "CALL" | "PUT";
  side: "BUY" | "SELL";
  strike: string;
  quantity: number;
  entryPremium: string;
};

export type SupportedVerticalSpreadAnalysis = {
  status: "supported";
  strategyType: "BEAR_PUT" | "BULL_CALL";
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
  | SupportedVerticalSpreadAnalysis
  | {
      status: "unsupported" | "invalid";
      reasonCode: string;
    };

function invalid(reasonCode: string): VerticalSpreadAnalysis {
  return { status: "invalid", reasonCode };
}

function unsupported(reasonCode: string): VerticalSpreadAnalysis {
  return { status: "unsupported", reasonCode };
}

function parseDecimal(value: unknown): Decimal | null {
  if (typeof value !== "string" || value.trim() === "") return null;

  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function isValidExpirationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateLeg(leg: VerticalSpreadLegInput): string | null {
  if (
    !leg ||
    typeof leg.asset !== "string" ||
    leg.asset.trim() === "" ||
    typeof leg.expirationDate !== "string" ||
    !isValidExpirationDate(leg.expirationDate) ||
    (leg.optionType !== "CALL" && leg.optionType !== "PUT") ||
    (leg.side !== "BUY" && leg.side !== "SELL") ||
    !Number.isSafeInteger(leg.quantity) ||
    leg.quantity <= 0
  ) {
    return "INVALID_LEG";
  }

  const strike = parseDecimal(leg.strike);
  const premium = parseDecimal(leg.entryPremium);
    if (!strike?.greaterThan(0) || !premium || premium.isNegative()) {
    return "INVALID_FINANCIAL_INPUT";
  }

  return null;
}

export function analyzeVerticalSpread(
  legs: VerticalSpreadLegInput[],
): VerticalSpreadAnalysis {
  if (!Array.isArray(legs) || legs.length !== 2) {
    return unsupported("TWO_LEGS_REQUIRED");
  }

  for (const leg of legs) {
    const error = validateLeg(leg);
    if (error) return invalid(error);
  }

  const [first, second] = legs;
  if (first.asset.trim().toUpperCase() !== second.asset.trim().toUpperCase()) {
    return unsupported("ASSET_MISMATCH");
  }
  if (first.expirationDate !== second.expirationDate) {
    return unsupported("EXPIRATION_MISMATCH");
  }
  if (first.quantity !== second.quantity) {
    return unsupported("QUANTITY_MISMATCH");
  }
  if (first.optionType !== second.optionType) {
    return unsupported("OPTION_TYPE_MISMATCH");
  }

  const longLeg = legs.find((leg) => leg.side === "BUY");
  const shortLeg = legs.find((leg) => leg.side === "SELL");
  if (!longLeg || !shortLeg) return unsupported("OPPOSITE_SIDES_REQUIRED");

  const longStrike = new Decimal(longLeg.strike);
  const shortStrike = new Decimal(shortLeg.strike);
  if (longStrike.equals(shortStrike)) return unsupported("STRIKES_MUST_DIFFER");

  let strategyType: SupportedVerticalSpreadAnalysis["strategyType"];
  if (
    longLeg.optionType === "PUT" &&
    longStrike.greaterThan(shortStrike)
  ) {
    strategyType = "BEAR_PUT";
  } else if (
    longLeg.optionType === "CALL" &&
    longStrike.lessThan(shortStrike)
  ) {
    strategyType = "BULL_CALL";
  } else {
    return unsupported("UNSUPPORTED_VERTICAL_SPREAD");
  }

  const longPremium = new Decimal(longLeg.entryPremium);
  const shortPremium = new Decimal(shortLeg.entryPremium);
  const netDebitPerOption = longPremium.minus(shortPremium);
  const lowerStrike = Decimal.min(longStrike, shortStrike);
  const higherStrike = Decimal.max(longStrike, shortStrike);
  const width = higherStrike.minus(lowerStrike);

  if (!netDebitPerOption.greaterThan(0) || !netDebitPerOption.lessThan(width)) {
    return unsupported("DEBIT_OUT_OF_RANGE");
  }

  const quantity = longLeg.quantity;
  const netDebitTotal = netDebitPerOption.times(quantity);
  const maxProfit = width.minus(netDebitPerOption).times(quantity);
  const maxLoss = netDebitTotal;
  const breakeven =
    strategyType === "BEAR_PUT"
      ? higherStrike.minus(netDebitPerOption)
      : lowerStrike.plus(netDebitPerOption);

  return {
    status: "supported",
    strategyType,
    lowerStrike: lowerStrike.toString(),
    higherStrike: higherStrike.toString(),
    quantity,
    width: width.toString(),
    netDebitPerOption: netDebitPerOption.toString(),
    netDebitTotal: netDebitTotal.toString(),
    maxProfit: maxProfit.toString(),
    maxLoss: maxLoss.toString(),
    breakeven: breakeven.toString(),
    maxProfitPercentage: maxProfit.dividedBy(netDebitTotal).times(100).toString(),
    returnRiskRatio: maxProfit.dividedBy(maxLoss).toString(),
  };
}

export function calculateVerticalSpreadExpirationResult(
  analysis: SupportedVerticalSpreadAnalysis,
  assetPrice: string,
): string {
  const price = parseDecimal(assetPrice);
  if (!price || price.isNegative()) {
    throw new TypeError("INVALID_ASSET_PRICE");
  }

  const lowerStrike = new Decimal(analysis.lowerStrike);
  const higherStrike = new Decimal(analysis.higherStrike);
  const debitPerOption = new Decimal(analysis.netDebitPerOption);

  if (analysis.strategyType === "BEAR_PUT") {
    if (price.greaterThanOrEqualTo(higherStrike)) {
      return new Decimal(analysis.maxLoss).negated().toString();
    }
    if (price.lessThanOrEqualTo(lowerStrike)) return analysis.maxProfit;
    return higherStrike
      .minus(price)
      .minus(debitPerOption)
      .times(analysis.quantity)
      .toString();
  }

  if (price.lessThanOrEqualTo(lowerStrike)) {
    return new Decimal(analysis.maxLoss).negated().toString();
  }
  if (price.greaterThanOrEqualTo(higherStrike)) return analysis.maxProfit;
  return price
    .minus(lowerStrike)
    .minus(debitPerOption)
    .times(analysis.quantity)
    .toString();
}
