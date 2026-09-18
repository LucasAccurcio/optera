import type { AssetQuote, MarketDataProvider } from './types.js';

type BrapiMarketDataProviderOptions = {
  token?: string;
  fetch?: typeof globalThis.fetch;
};

type BrapiQuote = {
  symbol?: unknown;
  regularMarketPrice?: unknown;
  regularMarketTime?: unknown;
};

export class ProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export class BrapiMarketDataProvider implements MarketDataProvider {
  private readonly token?: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: BrapiMarketDataProviderOptions = {}) {
    this.token = options.token?.trim() || undefined;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async getQuotes(assets: string[]): Promise<AssetQuote[]> {
    if (!this.token) return [];

    const normalizedAssets = assets.map((asset) => asset.trim().toUpperCase()).filter(Boolean);
    if (normalizedAssets.length === 0) return [];

    const url = `https://brapi.dev/api/quote/${normalizedAssets.join(',')}?token=${encodeURIComponent(this.token)}`;
    let response: Response;
    try {
      response = await this.fetch(url);
    } catch (error) {
      throw new ProviderError('Brapi request failed', { cause: error });
    }

    if (!response.ok) {
      throw new ProviderError(`Brapi request failed with status ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ProviderError('Brapi response was not valid JSON', { cause: error });
    }

    if (!isBrapiPayload(payload)) {
      throw new ProviderError('Brapi response had an invalid shape');
    }

    return payload.results.flatMap((quote) => {
      const asset = typeof quote.symbol === 'string' ? quote.symbol.trim().toUpperCase() : '';
      const price = parsePositivePrice(quote.regularMarketPrice);
      const timestamp = parseTimestamp(quote.regularMarketTime);
      if (!asset || price === undefined || timestamp === undefined) return [];

      return [{ asset, price, timestamp, source: 'brapi', delayed: true }];
    });
  }
}

const isBrapiPayload = (payload: unknown): payload is { results: BrapiQuote[] } => {
  const results =
    typeof payload === 'object' && payload !== null
      ? (payload as { results?: unknown }).results
      : undefined;

  return (
    Array.isArray(results) &&
    results.every((quote) => typeof quote === 'object' && quote !== null)
  );
};

const parsePositivePrice = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return undefined;
  return String(value);
};

const parseTimestamp = (value: unknown): string | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};
