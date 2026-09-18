import { AppError } from '../../shared/errors.js';
import type { AssetQuote, MarketDataProvider } from './types.js';
import type { QuoteRecord, QuoteRepository } from './repository.js';

export type QuoteView = {
  asset: string;
  price: string | null;
  timestamp: string | null;
  source: string;
  delayed: boolean;
  lastError: string | null;
};

export type QuoteWarning = {
  code: string;
  message: string;
  asset?: string;
};

export type QuoteResponse = {
  data: QuoteView[];
  updatedAt: string | null;
  warnings: QuoteWarning[];
};

type QuoteOperations = {
  findOpenAssets(): Promise<string[]>;
};

export type QuoteServiceDependencies = {
  provider: MarketDataProvider;
  repository: Pick<QuoteRepository, 'findByAssets' | 'findAll' | 'upsertSuccess' | 'recordFailure'>;
  operations: QuoteOperations;
  tokenAvailable: boolean;
};

export class QuoteService {
  private refreshing = false;

  constructor(private readonly dependencies: QuoteServiceDependencies) {}

  async getAll(): Promise<QuoteResponse> {
    return serialize(await this.dependencies.repository.findAll());
  }

  async refresh(): Promise<QuoteResponse> {
    if (this.refreshing) {
      throw new AppError(
        'QUOTES_REFRESH_IN_PROGRESS',
        'A quote refresh is already in progress',
        409,
      );
    }
    this.refreshing = true;
    try {
      const assets = uniqueAssets(await this.dependencies.operations.findOpenAssets());
      const cached = await this.dependencies.repository.findByAssets(assets);
      if (!this.dependencies.tokenAvailable) {
        return serialize(cached, [{ code: 'BRAPI_TOKEN_MISSING', message: 'BRAPI token is not configured' }], assets);
      }

      const warnings: QuoteWarning[] = [];
      let providerQuotes: AssetQuote[];
      try {
        providerQuotes = await this.dependencies.provider.getQuotes(assets);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Market data provider failed';
        await Promise.all(assets.map(async (asset) => {
          await this.dependencies.repository.recordFailure(asset, message);
          warnings.push({ code: 'QUOTE_PROVIDER_ERROR', message, asset });
        }));
        return serialize(await this.dependencies.repository.findByAssets(assets), warnings);
      }

      const returned = new Set<string>();
      for (const quote of providerQuotes) {
        const asset = normalizeAsset(quote.asset);
        if (!assets.includes(asset)) continue;
        if (!isValidQuote(quote)) {
          const message = 'Provider returned an invalid quote';
          await this.dependencies.repository.recordFailure(asset, message);
          warnings.push({ code: 'QUOTE_INVALID', message, asset });
          continue;
        }
        returned.add(asset);
        await this.dependencies.repository.upsertSuccess({ ...quote, asset });
      }
      for (const asset of assets) {
        if (returned.has(asset)) continue;
        const message = 'No quote returned for asset';
        await this.dependencies.repository.recordFailure(asset, message);
        warnings.push({ code: 'QUOTE_MISSING', message, asset });
      }
      return serialize(await this.dependencies.repository.findByAssets(assets), warnings, assets);
    } finally {
      this.refreshing = false;
    }
  }
}

function uniqueAssets(assets: string[]): string[] {
  return [...new Set(assets.map(normalizeAsset).filter(Boolean))];
}

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase();
}

function isValidQuote(quote: AssetQuote): boolean {
  const price = Number(quote.price);
  const timestamp = new Date(quote.timestamp);
  return Number.isFinite(price) && price > 0 && !Number.isNaN(timestamp.getTime());
}

function serialize(rows: QuoteRecord[], warnings: QuoteWarning[] = [], assets?: string[]): QuoteResponse {
  const byAsset = new Map(rows.map((row) => [row.asset, row]));
  const cachedRows = assets
    ? assets.map((asset) => byAsset.get(asset)).filter(Boolean) as QuoteRecord[]
    : rows;
  const ordered = assets
    ? assets.map((asset) => byAsset.get(asset) ?? emptyRecord(asset))
    : rows;
  const updatedAt = cachedRows.reduce<Date | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return {
    data: ordered.map((row) => ({
      asset: row.asset,
      price: row.price?.toString() ?? null,
      timestamp: row.timestamp?.toISOString() ?? null,
       source: row.source,
       delayed: row.delayed,
       lastError: row.lastError ?? null,
    })),
    updatedAt: updatedAt?.toISOString() ?? null,
    warnings,
  };
}

function emptyRecord(asset: string): QuoteRecord {
  return {
    id: asset,
    asset,
    price: null,
    timestamp: null,
    source: 'brapi',
    delayed: true,
    lastError: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
