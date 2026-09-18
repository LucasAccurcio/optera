import { describe, expect, it } from 'vitest';
import { calculateDistance, classifyOption } from '../src/shared/market/classification.js';

describe('market classification', () => {
  it('classifies a put below the strike as ITM', () => {
    expect(classifyOption('PUT', '99', '100')).toBe('ITM');
  });

  it('classifies a put above the strike as OTM', () => {
    expect(classifyOption('PUT', '102', '100')).toBe('OTM');
  });

  it('classifies a call above the strike as ITM', () => {
    expect(classifyOption('CALL', '102', '100')).toBe('ITM');
  });

  it('classifies a call below the strike as OTM', () => {
    expect(classifyOption('CALL', '98', '100')).toBe('OTM');
  });

  it('classifies a price within one percent as ATM', () => {
    expect(classifyOption('CALL', '100.5', '100')).toBe('ATM');
  });

  it('classifies the exact one percent boundary as ATM', () => {
    expect(classifyOption('CALL', '100', '99')).toBe('ATM');
  });

  it('uses a custom ATM margin', () => {
    expect(classifyOption('CALL', '102', '100')).toBe('ITM');
    expect(classifyOption('CALL', '102', '100', '2')).toBe('ATM');
  });

  it('returns null when the price is zero', () => {
    expect(classifyOption('CALL', '0', '100')).toBeNull();
    expect(calculateDistance('0', '100')).toBeNull();
  });

  it('returns null for invalid, non-finite, and negative prices', () => {
    for (const price of ['not-a-price', 'NaN', 'Infinity', '-Infinity', '-1']) {
      expect(calculateDistance(price, '100')).toBeNull();
      expect(classifyOption('CALL', price, '100')).toBeNull();
    }
  });

  it('calculates percentage distance using price as the denominator', () => {
    expect(calculateDistance('100', '99')).toEqual({ absolute: '1', percentage: '1' });
  });
});
