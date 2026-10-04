import { describe, expect, it, vi } from 'vitest';
import {
  closeOperation,
  closeStrategy,
  createOperation,
  deleteStrategy,
  getHealth,
  getQuotes,
  getStrategyAlerts,
  getStrategySimulation,
  normalizeDecimalInput,
  refreshQuotes,
  setStrategyAssetPrice,
} from './client';

describe('health client', () => {
  it('rejects non-success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(getHealth()).rejects.toThrow('API indisponível (503)');
  });

  it('normalizes Brazilian decimal separators', () => {
    expect(normalizeDecimalInput(' 22,04 ')).toBe('22.04');
    expect(normalizeDecimalInput('2.04')).toBe('2.04');
  });

  it('sends operation prices using the API decimal format', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await createOperation({
      asset: 'BBSA3',
      optionTicker: 'BBASW222',
      optionType: 'CALL',
      side: 'BUY',
      expirationDate: '2026-11-19',
      strike: '22,04',
      quantity: 200,
      openedAt: '2026-09-01',
      entryPremium: '2,04',
      strategyId: null,
      notes: null,
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      strike: '22.04',
      entryPremium: '2.04',
    });
  });

  it('does not send a JSON content type for empty DELETE requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    });
    vi.stubGlobal('fetch', fetchMock);

    await deleteStrategy('50b908a0-4c06-427a-97cb-ce71842fbc9c');

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
    });
  });

  it('gets the quote snapshot from the exact quotes path', async () => {
    const response = {
      data: [{ asset: 'PETR4', price: null, timestamp: null, source: 'brapi', delayed: true, lastError: null }],
      updatedAt: null,
      warnings: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getQuotes()).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/quotes', {
      headers: { Accept: 'application/json' },
    });
  });

  it('posts to the exact quote refresh path and surfaces refresh errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { message: 'A quote refresh is already in progress' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshQuotes()).rejects.toThrow('A quote refresh is already in progress');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/quotes/refresh', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
  });

  it('posts operation close quantity, date, and normalized effective price', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await closeOperation('6f6d8d13-5e23-4f64-8e38-08ea34a1f2d1', 25, '2026-02-01', '0,50');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/operations/6f6d8d13-5e23-4f64-8e38-08ea34a1f2d1/close',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          quantity: 25,
          closedAt: '2026-02-01',
          actualClosingPrice: '0.50',
        }),
      }),
    );
  });

  it('posts an atomic strategy close with normalized per-leg prices', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const strategyId = '4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1';
    const legs = [{
      operationId: '6f6d8d13-5e23-4f64-8e38-08ea34a1f2d1',
      quantity: 100,
      actualClosingPrice: '0,50',
      closedAt: '2026-02-01',
    }];

    await closeStrategy(strategyId, legs);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/strategies/${strategyId}/close`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          legs: [{ ...legs[0], actualClosingPrice: '0.50' }],
        }),
      }),
    );
  });

  it('uses strategy alerts, manual asset price, and simulation endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const strategyId = '4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1';

    await getStrategyAlerts(strategyId);
    await setStrategyAssetPrice(strategyId, '40,50');
    await getStrategySimulation(strategyId);

    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:3001/strategies/${strategyId}/alerts`);
    expect(fetchMock.mock.calls[1][0]).toBe(`http://localhost:3001/strategies/${strategyId}/asset-price`);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ price: '40.50' });
    expect(fetchMock.mock.calls[2][0]).toBe(`http://localhost:3001/strategies/${strategyId}/simulation`);
  });
});
