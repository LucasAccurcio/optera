import { Decimal } from 'decimal.js';

export type OptionType = 'CALL' | 'PUT';
export type OptionClassification = 'ITM' | 'ATM' | 'OTM';

export interface Distance {
  absolute: string;
  percentage: string;
}

function toPositiveDecimal(value: string): Decimal | null {
  if (typeof value !== 'string' || value.trim() === '') return null;

  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() && decimal.isPositive() && !decimal.isZero() ? decimal : null;
  } catch {
    return null;
  }
}

export function calculateDistance(price: string, strike: string): Distance | null {
  const priceDecimal = toPositiveDecimal(price);
  const strikeDecimal = toPositiveDecimal(strike);
  if (priceDecimal === null || strikeDecimal === null) return null;

  const absolute = priceDecimal.minus(strikeDecimal).abs();
  return {
    absolute: absolute.toString(),
    percentage: absolute.dividedBy(priceDecimal).times(100).toString(),
  };
}

export function classifyOption(
  optionType: OptionType,
  price: string,
  strike: string,
  atmMarginPercentage = '1',
): OptionClassification | null {
  const distance = calculateDistance(price, strike);
  if (distance === null) return null;

  const priceDecimal = toPositiveDecimal(price);
  const strikeDecimal = toPositiveDecimal(strike);
  if (priceDecimal === null || strikeDecimal === null) return null;

  if (new Decimal(distance.percentage).lessThanOrEqualTo(new Decimal(atmMarginPercentage))) {
    return 'ATM';
  }

  const isInTheMoney = optionType === 'CALL'
    ? priceDecimal.greaterThan(strikeDecimal)
    : priceDecimal.lessThan(strikeDecimal);
  return isInTheMoney ? 'ITM' : 'OTM';
}
