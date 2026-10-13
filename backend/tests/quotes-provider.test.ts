import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrapiMarketDataProvider, ProviderError } from '../src/modules/quotes/provider.js';

const originalQuoteUrl = process.env.BRAPI_QUOTE_URL;

describe('BrapiMarketDataProvider', () => {
  beforeEach(() => {
    process.env.BRAPI_QUOTE_URL = 'https://brapi.dev/api/quote';
  });

  afterEach(() => {
    if (originalQuoteUrl === undefined) delete process.env.BRAPI_QUOTE_URL;
    else process.env.BRAPI_QUOTE_URL = originalQuoteUrl;
  });

  it('makes one request per asset and maps the current BRAPI quote fields', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const asset = String(input).split('/').pop();
      const quote = asset === 'BBSE3'
        ? { symbol: 'bbse3', regularMarketPrice: 24.5, regularMarketTime: '2026-10-13T21:31:30.000Z' }
        : { symbol: 'PETR4', regularMarketPrice: '38.10', regularMarketTime: '2026-10-13T21:31:31.000Z' };
      return new Response(JSON.stringify({ results: [quote] }), { status: 200 });
    });
    const provider = new BrapiMarketDataProvider({ token: 'backend-secret', fetch });

    await expect(provider.getQuotes(['bbse3', 'petr4'])).resolves.toEqual([
      {
        asset: 'BBSE3',
        price: '24.5',
        timestamp: '2026-10-13T21:31:30.000Z',
        source: 'brapi',
        delayed: true,
      },
      {
        asset: 'PETR4',
        price: '38.10',
        timestamp: '2026-10-13T21:31:31.000Z',
        source: 'brapi',
        delayed: true,
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://brapi.dev/api/quote/BBSE3',
      { headers: { Authorization: 'Bearer backend-secret' } },
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://brapi.dev/api/quote/PETR4',
      { headers: { Authorization: 'Bearer backend-secret' } },
    );
  });

  it('waits for each request before starting the next one', async () => {
    let releaseFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(async () => {
        await firstRequest;
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const request = new BrapiMarketDataProvider({ token: 'secret', fetch }).getQuotes(['PETR4', 'VALE3']);

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    releaseFirst();
    await request;

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not expose the token outside the backend request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const provider = new BrapiMarketDataProvider({ token: 'backend-secret', fetch });

    await provider.getQuotes(['PETR4']);

    expect(fetch.mock.calls[0]?.[1]).toEqual({
      headers: { Authorization: 'Bearer backend-secret' },
    });
    expect(fetch.mock.calls[0]?.[0]).not.toContain('backend-secret');
  });

  it('excludes invalid and non-positive prices', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const asset = String(input).split('/').pop();
      const quotes = {
        PETR4: { symbol: 'PETR4', regularMarketPrice: 0, regularMarketTime: '2026-10-13T21:31:30.000Z' },
        VALE3: { symbol: 'VALE3', regularMarketPrice: -1, regularMarketTime: '2026-10-13T21:31:30.000Z' },
        ITUB4: { symbol: 'ITUB4', regularMarketPrice: 'not-a-price', regularMarketTime: '2026-10-13T21:31:30.000Z' },
        BBSE3: { symbol: 'BBSE3', regularMarketPrice: 21.25, regularMarketTime: '2026-10-13T21:31:30.000Z' },
      } as const;
      return new Response(JSON.stringify({ results: [quotes[asset as keyof typeof quotes]] }), { status: 200 });
    });
    const provider = new BrapiMarketDataProvider({ token: 'secret', fetch });

    await expect(provider.getQuotes(['PETR4', 'VALE3', 'ITUB4', 'BBSE3'])).resolves.toHaveLength(1);
  });

  it('includes the BRAPI error code and message for HTTP failures', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: true,
          message: 'Seu plano permite no máximo 1 ativo por requisição',
          code: 'QUOTES_PER_REQUEST_EXCEEDED',
        }),
        { status: 400 },
      ),
    );

    await expect(
      new BrapiMarketDataProvider({ token: 'secret', fetch }).getQuotes(['PETR4']),
    ).rejects.toMatchObject({
      message: 'Brapi request failed with status 400 (QUOTES_PER_REQUEST_EXCEEDED: Seu plano permite no máximo 1 ativo por requisição)',
      status: 400,
      code: 'QUOTES_PER_REQUEST_EXCEEDED',
      providerMessage: 'Seu plano permite no máximo 1 ativo por requisição',
    });
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
