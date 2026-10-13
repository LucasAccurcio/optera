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
  readonly status?: number;
  readonly code?: string;
  readonly providerMessage?: string;

  constructor(
    message: string,
    options?: ErrorOptions & { status?: number; code?: string; providerMessage?: string },
  ) {
    super(message, options);
    this.name = 'ProviderError';
    this.status = options?.status;
    this.code = options?.code;
    this.providerMessage = options?.providerMessage;
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

    const quotes: AssetQuote[] = [];
    for (const asset of normalizedAssets) {
      quotes.push(...await this.getQuote(asset));
    }
    return quotes;
  }

  private async getQuote(asset: string): Promise<AssetQuote[]> {
    const url = `${process.env.BRAPI_QUOTE_URL}/${asset}`;
    let response: Response;
    try {
      response = await this.fetch(url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
    } catch (error) {
      throw new ProviderError('Brapi request failed', { cause: error });
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      const error = parseBrapiError(response.status, payload);
      throw new ProviderError(error.message, error);
    }
    if (!isBrapiPayload(payload)) {
      throw new ProviderError('Brapi response had an invalid shape');
    }

    return payload.results.flatMap((quote) => {
      const quoteAsset = typeof quote.symbol === 'string' ? quote.symbol.trim().toUpperCase() : '';
      const price = parsePositivePrice(quote.regularMarketPrice);
      const timestamp = parseTimestamp(quote.regularMarketTime);
      if (!quoteAsset || price === undefined || timestamp === undefined) return [];

      return [{ asset: quoteAsset, price, timestamp, source: 'brapi', delayed: true }];
    });
  }
}

const readPayload = async (response: Response): Promise<unknown> => {
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw new ProviderError('Brapi response could not be read', { cause: error });
  }
  if (!body) return undefined;

  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (response.ok) {
      throw new ProviderError('Brapi response was not valid JSON', { cause: error });
    }
    return undefined;
  }
};

const parseBrapiError = (status: number, payload: unknown): {
  status: number;
  code?: string;
  providerMessage?: string;
  message: string;
} => {
  const body = typeof payload === 'object' && payload !== null
    ? payload as { code?: unknown; message?: unknown; error?: { code?: unknown; message?: unknown } }
    : undefined;
  const code = typeof body?.code === 'string'
    ? body.code
    : typeof body?.error?.code === 'string' ? body.error.code : undefined;
  const message = typeof body?.message === 'string'
    ? body.message
    : typeof body?.error?.message === 'string' ? body.error.message : undefined;
  const detail = [code, message].filter(Boolean).join(': ');
  return {
    status,
    code,
    providerMessage: message,
    message: `Brapi request failed with status ${status}${detail ? ` (${detail})` : ''}`,
  };
};

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
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};
