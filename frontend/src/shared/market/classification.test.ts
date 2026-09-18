import { describe, expect, it } from 'vitest';
import {
  calculateDistance,
  classifyOption,
  normalizeAssetKey,
  presentQuoteIndicators,
} from './classification';

describe('market classification', () => {
  it('normalizes quote and operation asset keys', () => {
    expect(normalizeAssetKey('  petr4 ')).toBe('PETR4');
  });
  it('matches the option direction rules', () => {
    expect(classifyOption('PUT', '99', '100')).toBe('ITM');
    expect(classifyOption('PUT', '102', '100')).toBe('OTM');
    expect(classifyOption('CALL', '102', '100')).toBe('ITM');
    expect(classifyOption('CALL', '98', '100')).toBe('OTM');
  });

  it('applies the default one percent ATM margin', () => {
    expect(classifyOption('CALL', '100.5', '100')).toBe('ATM');
  });

  it('applies the exact one percent boundary and custom margin', () => {
    expect(classifyOption('CALL', '100', '99')).toBe('ATM');
    expect(classifyOption('CALL', '102', '100')).toBe('ITM');
    expect(classifyOption('CALL', '102', '100', '2')).toBe('ATM');
  });

  it('returns null for a zero price', () => {
    expect(classifyOption('CALL', '0', '100')).toBeNull();
    expect(calculateDistance('0', '100')).toBeNull();
  });

  it('returns null for invalid, non-finite, and negative prices', () => {
    for (const price of ['not-a-price', 'NaN', 'Infinity', '-Infinity', '-1']) {
      expect(calculateDistance(price, '100')).toBeNull();
      expect(classifyOption('CALL', price, '100')).toBeNull();
    }
  });

  it('calculates percentage distance from the price', () => {
    expect(calculateDistance('100', '99')).toEqual({ absolute: '1', percentage: '1' });
  });

  it('returns placeholders when a quote is missing', () => {
    expect(presentQuoteIndicators('CALL', '100', null)).toEqual({
      price: '-',
      absolute: '-',
      percentage: '-',
      classification: '-',
    });
  });

  it('presents a valid CALL quote with price and distances', () => {
    expect(presentQuoteIndicators('CALL', '100', '102')).toEqual({
      price: '102',
      absolute: '2',
      percentage: '1.9607843137254901961',
      classification: 'ITM',
    });
  });
});
