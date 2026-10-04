import { describe, expect, it } from 'vitest';
import {
  analyzeVerticalSpread,
  calculateVerticalSpreadExpirationResult,
} from '../src/shared/financial/vertical-spread.js';
import type {
  SupportedVerticalSpreadAnalysis,
  VerticalSpreadLegInput,
} from '../src/shared/financial/vertical-spread.js';

const bearPutLegs: VerticalSpreadLegInput[] = [
  {
    asset: 'BBSE3',
    expirationDate: '2026-10-16',
    optionType: 'PUT',
    side: 'BUY',
    strike: '41.70',
    quantity: 200,
    entryPremium: '1.64',
  },
  {
    asset: 'BBSE3',
    expirationDate: '2026-10-16',
    optionType: 'PUT',
    side: 'SELL',
    strike: '39.45',
    quantity: 200,
    entryPremium: '0.69',
  },
];

const bullCallLegs: VerticalSpreadLegInput[] = [
  {
    asset: 'BBSE3',
    expirationDate: '2026-10-16',
    optionType: 'CALL',
    side: 'BUY',
    strike: '39.45',
    quantity: 200,
    entryPremium: '1.64',
  },
  {
    asset: 'BBSE3',
    expirationDate: '2026-10-16',
    optionType: 'CALL',
    side: 'SELL',
    strike: '41.70',
    quantity: 200,
    entryPremium: '0.69',
  },
];

function expectSupported(
  legs: VerticalSpreadLegInput[],
): SupportedVerticalSpreadAnalysis {
  const analysis = analyzeVerticalSpread(legs);
  expect(analysis.status).toBe('supported');
  if (analysis.status !== 'supported') {
    throw new Error(`Expected a supported spread, got ${analysis.status}`);
  }
  return analysis;
}

function withLeg(
  legs: VerticalSpreadLegInput[],
  index: number,
  changes: Partial<VerticalSpreadLegInput>,
): VerticalSpreadLegInput[] {
  return legs.map((leg, legIndex) =>
    legIndex === index ? { ...leg, ...changes } : leg,
  );
}

describe('analyzeVerticalSpread', () => {
  it('recognizes a bear put debit spread with long put at the higher strike', () => {
    expect(analyzeVerticalSpread(bearPutLegs)).toMatchObject({
      status: 'supported',
      strategyType: 'BEAR_PUT',
    });
  });

  it('recognizes a bull call debit spread with long call at the lower strike', () => {
    expect(analyzeVerticalSpread(bullCallLegs)).toMatchObject({
      status: 'supported',
      strategyType: 'BULL_CALL',
    });
  });

  it.each([
    ['a bull put spread', withLeg(bearPutLegs, 0, { side: 'SELL' })],
    ['a bear call spread', withLeg(bullCallLegs, 0, { side: 'SELL' })],
    ['reversed bear put legs', withLeg(bearPutLegs, 0, { strike: '39.45' })],
    ['reversed bull call legs', withLeg(bullCallLegs, 0, { strike: '41.70' })],
    ['mixed option types', withLeg(bearPutLegs, 1, { optionType: 'CALL' })],
    ['different underlyings', withLeg(bearPutLegs, 1, { asset: 'PETR4' })],
    [
      'different expirations',
      withLeg(bearPutLegs, 1, { expirationDate: '2026-10-23' }),
    ],
    ['different initial quantities', withLeg(bearPutLegs, 1, { quantity: 100 })],
    ['equal strikes', withLeg(bearPutLegs, 1, { strike: '41.70' })],
    ['zero quantity', withLeg(bearPutLegs, 1, { quantity: 0 })],
  ])('does not support %s', (_description, legs) => {
    const result = analyzeVerticalSpread(legs);

    expect(result.status).not.toBe('supported');
    expect(result).toHaveProperty('reasonCode');
  });

  it('does not support a strategy with a leg count other than two', () => {
    expect(analyzeVerticalSpread([...bearPutLegs, bearPutLegs[0]]).status).not.toBe(
      'supported',
    );
    expect(analyzeVerticalSpread([bearPutLegs[0]]).status).not.toBe('supported');
  });

  it.each([
    ['negative strike', withLeg(bearPutLegs, 0, { strike: '-41.70' })],
    ['zero strike', withLeg(bearPutLegs, 0, { strike: '0' })],
    ['malformed strike', withLeg(bearPutLegs, 0, { strike: 'not-a-number' })],
    ['negative premium', withLeg(bearPutLegs, 0, { entryPremium: '-1.64' })],
    ['malformed premium', withLeg(bearPutLegs, 0, { entryPremium: 'invalid' })],
  ])('rejects %s as invalid input', (_description, legs) => {
    expect(analyzeVerticalSpread(legs).status).toBe('invalid');
  });

  it.each([
    ['zero debit', '0.69'],
    ['negative debit', '0.49'],
    ['debit equal to width', '2.94'],
    ['debit greater than width', '3.00'],
  ])('does not report metrics for %s', (_description, longPremium) => {
    const legs = withLeg(bearPutLegs, 0, { entryPremium: longPremium });

    expect(analyzeVerticalSpread(legs).status).not.toBe('supported');
  });

  it('calculates the limits and break-even for the bear put spread', () => {
    expect(analyzeVerticalSpread(bearPutLegs)).toMatchObject({
      status: 'supported',
      strategyType: 'BEAR_PUT',
      lowerStrike: '39.45',
      higherStrike: '41.7',
      quantity: 200,
      width: '2.25',
      netDebitPerOption: '0.95',
      netDebitTotal: '190',
      maxProfit: '260',
      maxLoss: '190',
      breakeven: '40.75',
      maxProfitPercentage: '136.84210526315789474',
      returnRiskRatio: '1.3684210526315789474',
    });
  });

  it('calculates the limits and break-even for the bull call spread', () => {
    expect(analyzeVerticalSpread(bullCallLegs)).toMatchObject({
      status: 'supported',
      strategyType: 'BULL_CALL',
      lowerStrike: '39.45',
      higherStrike: '41.7',
      quantity: 200,
      width: '2.25',
      netDebitPerOption: '0.95',
      netDebitTotal: '190',
      maxProfit: '260',
      maxLoss: '190',
      breakeven: '40.4',
      maxProfitPercentage: '136.84210526315789474',
      returnRiskRatio: '1.3684210526315789474',
    });
  });
});

describe('calculateVerticalSpreadExpirationResult', () => {
  const bearPut = expectSupported(bearPutLegs);
  const bullCall = expectSupported(bullCallLegs);

  it.each([
    ['above the higher strike', '42', '-190'],
    ['at the higher strike', '41.70', '-190'],
    ['between the strikes', '40.50', '50'],
    ['at break-even', '40.75', '0'],
    ['at the lower strike', '39.45', '260'],
    ['below the lower strike', '38', '260'],
  ])('calculates bear put payoff %s', (_description, assetPrice, expected) => {
    expect(
      calculateVerticalSpreadExpirationResult(bearPut, assetPrice),
    ).toBe(expected);
  });

  it.each([
    ['below the lower strike', '38', '-190'],
    ['at the lower strike', '39.45', '-190'],
    ['between the strikes', '40.50', '20'],
    ['at break-even', '40.40', '0'],
    ['at the higher strike', '41.70', '260'],
    ['above the higher strike', '42', '260'],
  ])('calculates bull call payoff %s', (_description, assetPrice, expected) => {
    expect(
      calculateVerticalSpreadExpirationResult(bullCall, assetPrice),
    ).toBe(expected);
  });
});
