import { describe, expect, it } from 'vitest';
import { calculateDte, getDteStatus } from '../src/shared/market/dte.js';

describe('weekday DTE', () => {
  it('counts Friday to Monday as one business day', () => {
    expect(
      calculateDte(new Date('2026-09-18T12:00:00.000Z'), '2026-09-21'),
    ).toBe(1);
  });

  it('counts a weekday holiday because no holiday calendar is applied', () => {
    expect(
      calculateDte(new Date('2026-12-24T12:00:00.000Z'), '2026-12-25'),
    ).toBe(1);
  });

  it('returns zero on or after expiry and null for invalid dates', () => {
    expect(
      calculateDte(new Date('2026-09-18T12:00:00.000Z'), '2026-09-18'),
    ).toBe(0);
    expect(
      calculateDte(new Date('2026-09-21T12:00:00.000Z'), '2026-09-18'),
    ).toBe(0);
    expect(
      calculateDte(new Date('invalid'), '2026-09-18'),
    ).toBeNull();
  });
});

describe('DTE status bands', () => {
  it.each([
    [null, null],
    [0, 'expired'],
    [3, 'critical'],
    [7, 'alert'],
    [15, 'attention'],
    [16, 'normal'],
  ] as const)('maps %s days to %s', (dte, status) => {
    expect(getDteStatus(dte)).toBe(status);
  });
});
