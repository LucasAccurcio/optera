import { describe, expect, it, vi } from 'vitest';
import { BrapiMarketDataProvider, ProviderError } from '../src/modules/quotes/provider.js';

describe('BrapiMarketDataProvider', () => {
  it('makes one batched backend request and maps valid quote fields', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { symbol: 'bbse3', regularMarketPrice: 24.5, regularMarketTime: 1_700_000_000 },
            { symbol: 'PETR4', regularMarketPrice: '38.10', regularMarketTime: 1_700_000_001 },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new BrapiMarketDataProvider({ token: 'backend-secret', fetch });

    await expect(provider.getQuotes(['bbse3', 'petr4'])).resolves.toEqual([
      {
        asset: 'BBSE3',
        price: '24.5',
        timestamp: new Date(1_700_000_000 * 1000).toISOString(),
        source: 'brapi',
        delayed: true,
      },
      {
        asset: 'PETR4',
        price: '38.10',
        timestamp: new Date(1_700_000_001 * 1000).toISOString(),
        source: 'brapi',
        delayed: true,
      },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      'https://brapi.dev/api/quote/BBSE3,PETR4?token=backend-secret',
    );
  });

  it('does not expose the token outside the backend request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const provider = new BrapiMarketDataProvider({ token: 'backend-secret', fetch });

    await provider.getQuotes(['PETR4']);

    expect(fetch.mock.calls[0]?.[1]).toBeUndefined();
    expect(JSON.stringify(fetch.mock.calls)).toContain('backend-secret');
  });

  it('excludes invalid and non-positive prices', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { symbol: 'PETR4', regularMarketPrice: 0, regularMarketTime: 1_700_000_000 },
            { symbol: 'VALE3', regularMarketPrice: -1, regularMarketTime: 1_700_000_000 },
            { symbol: 'ITUB4', regularMarketPrice: 'not-a-price', regularMarketTime: 1_700_000_000 },
            { symbol: 'BBSE3', regularMarketPrice: 21.25, regularMarketTime: 1_700_000_000 },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new BrapiMarketDataProvider({ token: 'secret', fetch });

    await expect(provider.getQuotes(['PETR4', 'VALE3', 'ITUB4', 'BBSE3'])).resolves.toHaveLength(1);
  });

  it('throws a provider error for transport failures and malformed responses', async () => {
    const transportFetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('network down'));
    const malformedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await expect(
      new BrapiMarketDataProvider({ token: 'secret', fetch: transportFetch }).getQuotes(['PETR4']),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      new BrapiMarketDataProvider({ token: 'secret', fetch: malformedFetch }).getQuotes(['PETR4']),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('returns no quotes without invoking fetch when the token is absent', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const provider = new BrapiMarketDataProvider({ fetch });

    await expect(provider.getQuotes(['PETR4'])).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
