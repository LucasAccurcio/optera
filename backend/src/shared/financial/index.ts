import { Decimal } from 'decimal.js';

export type FinancialSide = 'BUY' | 'SELL';
export type DecimalInput = string | Decimal;
export type OperationStatus = 'OPEN' | 'CLOSED';

export interface OperationFinancialInput {
  side: FinancialSide;
  entryPremium: DecimalInput;
  quantity: number;
  simulatedClosingPrice: DecimalInput;
  closedAt?: Date | string | null;
  actualClosingPrice?: DecimalInput | null;
}

export interface StrategyFinancialInput {
  operations: OperationFinancialInput[];
  mode?: 'simulated' | 'actual';
}

export interface StrategyFinancialResult {
  totalPremium: Decimal;
  result: Decimal;
  resultPercentage: Decimal;
}

const SIXTY_PERCENT = new Decimal('0.6');

function toDecimal(value: DecimalInput, fieldName: string): Decimal {
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) throw new Error(`${fieldName} must be finite`);
    return decimal;
  } catch {
    throw new Error(`${fieldName} must be a valid decimal value`);
  }
}

function validateNonNegative(value: Decimal, fieldName: string): void {
  if (value.isNegative()) throw new Error(`${fieldName} cannot be negative`);
}

export function validateQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('quantity must be a positive integer');
  }
}

export function calculateInitialClosingPrice(side: FinancialSide, entryPremium: DecimalInput): Decimal {
  const premium = toDecimal(entryPremium, 'entryPremium');
  validateNonNegative(premium, 'entryPremium');
  return side === 'SELL'
    ? premium.times(new Decimal(1).minus(SIXTY_PERCENT))
    : premium.times(new Decimal(1).plus(SIXTY_PERCENT));
}

export function calculateTotalPremium(entryPremium: DecimalInput, quantity: number): Decimal {
  validateQuantity(quantity);
  const premium = toDecimal(entryPremium, 'entryPremium');
  validateNonNegative(premium, 'entryPremium');
  return premium.times(quantity);
}

export function calculateResult(
  side: FinancialSide,
  entryPremium: DecimalInput,
  closingPrice: DecimalInput,
  quantity: number,
): Decimal {
  validateQuantity(quantity);
  const premium = toDecimal(entryPremium, 'entryPremium');
  const closing = toDecimal(closingPrice, 'closingPrice');
  validateNonNegative(premium, 'entryPremium');
  validateNonNegative(closing, 'closingPrice');
  const priceDifference = side === 'SELL' ? premium.minus(closing) : closing.minus(premium);
  return priceDifference.times(quantity);
}

export function calculateResultPercentage(
  result: DecimalInput,
  totalPremium: DecimalInput,
): Decimal {
  const resultDecimal = toDecimal(result, 'result');
  const premiumDecimal = toDecimal(totalPremium, 'totalPremium');
  validateNonNegative(premiumDecimal, 'totalPremium');
  return premiumDecimal.isZero() ? new Decimal(0) : resultDecimal.dividedBy(premiumDecimal);
}

export function getOperationStatus(closedAt?: Date | string | null): OperationStatus {
  return closedAt ? 'CLOSED' : 'OPEN';
}

export function validateOperationClosure(operation: OperationFinancialInput): void {
  const status = getOperationStatus(operation.closedAt);
  if (status === 'CLOSED' && operation.actualClosingPrice == null) {
    throw new Error('closed operation requires actualClosingPrice');
  }
  if (status === 'OPEN' && operation.actualClosingPrice != null) {
    throw new Error('open operation cannot have actualClosingPrice');
  }
  if (operation.actualClosingPrice != null) {
    const actualPrice = toDecimal(operation.actualClosingPrice, 'actualClosingPrice');
    validateNonNegative(actualPrice, 'actualClosingPrice');
  }
}

export function calculateOperationResult(
  operation: OperationFinancialInput,
  mode: 'simulated' | 'actual' = 'simulated',
): Decimal {
  validateOperationClosure(operation);
  const closingPrice = mode === 'actual'
    ? operation.actualClosingPrice
    : operation.simulatedClosingPrice;
  if (closingPrice == null) throw new Error('actual result requires actualClosingPrice');
  return calculateResult(operation.side, operation.entryPremium, closingPrice, operation.quantity);
}

export function calculateStrategyResult({ operations, mode = 'simulated' }: StrategyFinancialInput): StrategyFinancialResult {
  const totalPremium = operations.reduce(
    (total, operation) => total.plus(calculateTotalPremium(operation.entryPremium, operation.quantity)),
    new Decimal(0),
  );
  const result = operations.reduce(
    (total, operation) => total.plus(calculateOperationResult(operation, mode)),
    new Decimal(0),
  );
  return { totalPremium, result, resultPercentage: calculateResultPercentage(result, totalPremium) };
}

export { SIXTY_PERCENT };
