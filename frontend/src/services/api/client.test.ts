import { describe, expect, it, vi } from 'vitest';
import {
  createOperation,
  deleteStrategy,
  getHealth,
  normalizeDecimalInput,
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
});
