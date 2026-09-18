import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  calculateInitialClosingPrice,
  calculateOperationResult,
  calculateResult,
  calculateResultPercentage,
  calculateStrategyResult,
  calculateTotalPremium,
  getOperationStatus,
  validateOperationClosure,
} from '../src/shared/financial/index.js';

const value = (decimal: Decimal) => decimal.toFixed(6);

describe('financial engine', () => {
  it('calculates the initial closing price for a sold option', () => {
    expect(value(calculateInitialClosingPrice('SELL', '1.00'))).toBe('0.400000');
  });

  it('calculates the initial closing price for a bought option', () => {
    expect(value(calculateInitialClosingPrice('BUY', '1.00'))).toBe('1.600000');
  });

  it('calculates bought and sold results with quantity', () => {
    expect(value(calculateResult('SELL', '1.00', '0.40', 100))).toBe('60.000000');
    expect(value(calculateResult('BUY', '1.00', '1.60', 100))).toBe('60.000000');
    expect(value(calculateResult('SELL', '1.00', '1.20', 100))).toBe('-20.000000');
    expect(value(calculateResult('BUY', '1.00', '0.80', 100))).toBe('-20.000000');
  });

  it('calculates total premium and keeps decimal precision', () => {
    expect(calculateTotalPremium('0.1', 3).toString()).toBe('0.3');
  });

  it('returns result percentage as a decimal ratio', () => {
    expect(calculateResultPercentage('60', '100').toString()).toBe('0.6');
    expect(calculateResultPercentage('-20', '100').toString()).toBe('-0.2');
  });

  it('derives operation status from closedAt', () => {
    expect(getOperationStatus()).toBe('OPEN');
    expect(getOperationStatus('2026-01-01')).toBe('CLOSED');
  });

  it('requires consistent data for closed and open operations', () => {
    expect(() => validateOperationClosure({ side: 'BUY', entryPremium: '1', quantity: 1, simulatedClosingPrice: '1' })).not.toThrow();
    expect(() => validateOperationClosure({ side: 'BUY', entryPremium: '1', quantity: 1, simulatedClosingPrice: '1', closedAt: '2026-01-01' })).toThrow('requires actualClosingPrice');
    expect(() => validateOperationClosure({ side: 'BUY', entryPremium: '1', quantity: 1, simulatedClosingPrice: '1', actualClosingPrice: '1' })).toThrow('cannot have actualClosingPrice');
  });

  it('calculates simulated and actual operation results', () => {
    const operation = { side: 'SELL' as const, entryPremium: '1', quantity: 100, simulatedClosingPrice: '0.4', closedAt: '2026-01-01', actualClosingPrice: '0.5' };
    expect(value(calculateOperationResult(operation))).toBe('60.000000');
    expect(value(calculateOperationResult(operation, 'actual'))).toBe('50.000000');
  });

  it('consolidates multiple strategy legs', () => {
    const strategy = calculateStrategyResult({ operations: [
      { side: 'SELL', entryPremium: '1', quantity: 100, simulatedClosingPrice: '0.4' },
      { side: 'BUY', entryPremium: '2', quantity: 100, simulatedClosingPrice: '2.6' },
    ] });
    expect(strategy.totalPremium.toString()).toBe('300');
    expect(strategy.result.toString()).toBe('120');
    expect(strategy.resultPercentage.toString()).toBe('0.4');
  });

  it('rejects invalid quantities and negative prices', () => {
    expect(() => calculateTotalPremium('1', 0)).toThrow('positive integer');
    expect(() => calculateTotalPremium('1', 1.5)).toThrow('positive integer');
    expect(() => calculateResult('BUY', '-1', '1', 1)).toThrow('cannot be negative');
    expect(() => calculateResult('BUY', '1', '-1', 1)).toThrow('cannot be negative');
  });
});
