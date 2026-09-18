import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AssetQuote } from '../src/modules/quotes/types.js';
import type { QuoteRecord } from '../src/modules/quotes/repository.js';
import { QuoteService } from '../src/modules/quotes/service.js';

process.env.DATABASE_URL ??= 'postgresql://optera:optera@localhost:5432/optera_app';

describe('market quote configuration and cache', () => {
  it('accepts an absent BRAPI token as an explicit undefined value', async () => {
    delete process.env.BRAPI_TOKEN;
    vi.resetModules();
    const { env } = await import('../src/config/env.js');

    expect(env).toHaveProperty('brapiToken', undefined);
  });

  it('normalizes an empty BRAPI token to undefined', async () => {
    process.env.BRAPI_TOKEN = '';
    vi.resetModules();
    const { env } = await import('../src/config/env.js');

    expect(env.brapiToken).toBeUndefined();
  });

  it('represents a failed cache record with nullable market data', () => {
    const cacheRecord = Prisma.validator<Prisma.AssetQuoteCreateInput>()({
      asset: 'PETR4',
      price: null,
      timestamp: null,
      source: 'brapi',
      delayed: true,
      lastError: 'provider unavailable',
    });

    expect(cacheRecord).toEqual({
      asset: 'PETR4',
      price: null,
      timestamp: null,
      source: 'brapi',
      delayed: true,
      lastError: 'provider unavailable',
    });
  });

  it('refreshes one quote batch for distinct open assets and persists successes', async () => {
    const provider = { getQuotes: vi.fn(async (assets: string[]) => assets.map((asset) => quote(asset))) };
    const operations = { findOpenAssets: vi.fn(async () => ['petr4', ' PETR4 ', 'vale3', 'CLOSED']) };
    const repository = quoteRepository();
    const service = new QuoteService({ provider, operations, repository, tokenAvailable: true });

    const result = await service.refresh();

    expect(operations.findOpenAssets).toHaveBeenCalledOnce();
    expect(provider.getQuotes).toHaveBeenCalledWith(['PETR4', 'VALE3', 'CLOSED']);
    expect(repository.upsertSuccess).toHaveBeenCalledTimes(3);
    expect(result.data.map((item) => item.asset)).toEqual(['PETR4', 'VALE3', 'CLOSED']);
  });

  it('preserves cached values when the provider omits an asset', async () => {
    const provider = { getQuotes: vi.fn(async () => [quote('PETR4', '42.10')]) };
    const operations = { findOpenAssets: vi.fn(async () => ['PETR4', 'VALE3']) };
    const repository = quoteRepository([
      cachedQuote('PETR4', '40.00', '2026-09-18T10:00:00.000Z'),
      cachedQuote('VALE3', '40.00', '2026-09-18T10:00:00.000Z'),
    ]);
    const service = new QuoteService({ provider, operations, repository, tokenAvailable: true });

    const result = await service.refresh();

    expect(repository.recordFailure).toHaveBeenCalledWith('VALE3', expect.stringContaining('No quote returned'));
    expect(result.data).toEqual([
      expect.objectContaining({ asset: 'PETR4', price: '42.1' }),
      expect.objectContaining({ asset: 'VALE3', price: '40', timestamp: '2026-09-18T10:00:00.000Z', lastError: 'No quote returned for asset' }),
    ]);
    expect(result.warnings).toEqual([expect.objectContaining({ asset: 'VALE3' })]);
  });

  it('returns cached data and warns without calling the provider when the token is unavailable', async () => {
    const provider = { getQuotes: vi.fn() };
    const operations = { findOpenAssets: vi.fn(async () => ['PETR4', 'VALE3']) };
    const repository = quoteRepository([cachedQuote('PETR4', '40.00', '2026-09-18T10:00:00.000Z')]);
    const service = new QuoteService({ provider, operations, repository, tokenAvailable: false });

    const result = await service.refresh();

    expect(provider.getQuotes).not.toHaveBeenCalled();
    expect(repository.recordFailure).not.toHaveBeenCalled();
    expect(result.data).toEqual([
      expect.objectContaining({ asset: 'PETR4', price: '40', lastError: null }),
      expect.objectContaining({ asset: 'VALE3', price: null, timestamp: null, lastError: null }),
    ]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'BRAPI_TOKEN_MISSING' })]);
  });

  it('returns all cache rows without contacting operations or the provider', async () => {
    const repository = quoteRepository([cachedQuote('PETR4', '40.00', '2026-09-18T10:00:00.000Z')]);
    const operations = { findOpenAssets: vi.fn() };
    const provider = { getQuotes: vi.fn() };
    const service = new QuoteService({ provider, operations, repository, tokenAvailable: true });

    await expect(service.getAll()).resolves.toMatchObject({
      data: [expect.objectContaining({ asset: 'PETR4', price: '40', lastError: null })],
      updatedAt: '2026-09-18T10:00:00.000Z',
      warnings: [],
    });
    expect(operations.findOpenAssets).not.toHaveBeenCalled();
    expect(provider.getQuotes).not.toHaveBeenCalled();
  });

  it('rejects a concurrent refresh with the stable application error code', async () => {
    let release!: () => void;
    const provider = { getQuotes: vi.fn(() => new Promise<AssetQuote[]>((resolve) => { release = () => resolve([]); })) };
    const operations = { findOpenAssets: vi.fn(async () => ['PETR4']) };
    const repository = quoteRepository();
    const service = new QuoteService({ provider, operations, repository, tokenAvailable: true });

    const first = service.refresh();
    await vi.waitFor(() => expect(provider.getQuotes).toHaveBeenCalledOnce());
    await expect(service.refresh()).rejects.toMatchObject({
      code: 'QUOTES_REFRESH_IN_PROGRESS',
    });
    release();
    await first;
    expect(provider.getQuotes).toHaveBeenCalledOnce();
  });
});

const quote = (asset: string, price = '10.00'): AssetQuote => ({
  asset,
  price,
  timestamp: '2026-09-18T10:00:00.000Z',
  source: 'brapi',
  delayed: true,
});

const cachedQuote = (asset: string, price: string, timestamp: string): QuoteRecord => ({
  id: asset,
  asset,
  price: new Prisma.Decimal(price),
  timestamp: new Date(timestamp),
  source: 'brapi',
  delayed: true,
  lastError: null,
  createdAt: new Date(timestamp),
  updatedAt: new Date(timestamp),
});

const quoteRepository = (initial: QuoteRecord[] = []) => {
  let rows = [...initial];
  return {
    findByAssets: vi.fn(async (assets: string[]) => assets.map((asset) => rows.find((row) => row.asset === asset)).filter(Boolean) as QuoteRecord[]),
    findAll: vi.fn(async () => rows),
    upsertSuccess: vi.fn(async (input: AssetQuote) => {
      const row = cachedQuote(input.asset, input.price, input.timestamp);
      rows = [...rows.filter((item) => item.asset !== input.asset), row];
      return row;
    }),
    recordFailure: vi.fn(async (asset: string, message: string) => {
      const existing = rows.find((row) => row.asset === asset);
      const row = { ...(existing ?? emptyQuote(asset)), lastError: message };
      rows = [...rows.filter((item) => item.asset !== asset), row];
      return row;
    }),
  };
};

const emptyQuote = (asset: string): QuoteRecord => ({
  id: asset,
  asset,
  price: null,
  timestamp: null,
  source: 'brapi',
  delayed: true,
  lastError: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
