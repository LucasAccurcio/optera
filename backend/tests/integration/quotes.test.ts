import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetQuote, MarketDataProvider } from '../../src/modules/quotes/types.js';

process.env.DATABASE_URL ??= 'postgresql://optera:optera@localhost:5432/optera_app';

const quote = (asset: string, price = '42.10'): AssetQuote => ({
  asset,
  price,
  timestamp: '2026-09-18T10:00:00.000Z',
  source: 'brapi',
  delayed: true,
});

const cachedQuote = (asset: string, price: string, timestamp: string) => ({
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

function makeDatabase(initialQuotes = [cachedQuote('PETR4', '40.00', '2026-09-18T09:00:00.000Z')]) {
  const quotes = [...initialQuotes];
  return {
    operation: {
      findMany: vi.fn(async ({ where }: any) =>
        where?.closedAt === null ? [{ asset: 'PETR4' }, { asset: 'VALE3' }] : [],
      ),
      count: vi.fn(async () => 0),
    },
    assetQuote: {
      findMany: vi.fn(async ({ where }: any = {}) => {
        const rows = where?.asset?.in
          ? quotes.filter((row) => where.asset.in.includes(row.asset))
          : quotes;
        return rows.sort((left, right) => left.asset.localeCompare(right.asset));
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const current = quotes.find((row) => row.asset === where.asset);
        const row = { ...(current ?? { id: where.asset, asset: where.asset, createdAt: new Date() }), ...(current ? update : create), updatedAt: new Date() };
        const index = quotes.findIndex((item) => item.asset === where.asset);
        if (index === -1) quotes.push(row);
        else quotes[index] = row;
        return row;
      }),
    },
  };
}

async function loadApp() {
  vi.resetModules();
  return import('../../src/app.js');
}

afterEach(() => {
  delete process.env.BRAPI_TOKEN;
});

describe('quote HTTP routes', () => {
  it('returns cached quotes without contacting the provider', async () => {
    process.env.BRAPI_TOKEN = 'test-token';
    const provider: MarketDataProvider = { getQuotes: vi.fn() };
    const database = makeDatabase();
    const { buildApp } = await loadApp();
    const app = buildApp({ withDatabase: false, prisma: database, quoteProvider: provider });

    const response = await app.inject({ method: 'GET', url: '/quotes' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [expect.objectContaining({ asset: 'PETR4', price: '40' })],
      warnings: [],
    });
    expect(provider.getQuotes).not.toHaveBeenCalled();
    await app.close();
  });

  it('refreshes only open assets through the provider', async () => {
    process.env.BRAPI_TOKEN = 'test-token';
    const provider: MarketDataProvider = { getQuotes: vi.fn(async (assets: string[]) => assets.map((asset) => quote(asset))) };
    const database = makeDatabase([]);
    const { buildApp } = await loadApp();
    const app = buildApp({ withDatabase: false, prisma: database, quoteProvider: provider });

    const response = await app.inject({ method: 'POST', url: '/quotes/refresh' });

    expect(response.statusCode).toBe(200);
    expect(provider.getQuotes).toHaveBeenCalledWith(['PETR4', 'VALE3']);
    expect(response.json().data.map((item: any) => item.asset)).toEqual(['PETR4', 'VALE3']);
    await app.close();
  });

  it('returns a warning and does not call the provider when the token is missing', async () => {
    const provider: MarketDataProvider = { getQuotes: vi.fn() };
    const { buildApp } = await loadApp();
    const app = buildApp({ withDatabase: false, prisma: makeDatabase(), quoteProvider: provider });

    const response = await app.inject({ method: 'POST', url: '/quotes/refresh' });

    expect(response.statusCode).toBe(200);
    expect(response.json().warnings).toEqual([
      expect.objectContaining({ code: 'BRAPI_TOKEN_MISSING' }),
    ]);
    expect(provider.getQuotes).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 409 when a second refresh starts before the first completes', async () => {
    process.env.BRAPI_TOKEN = 'test-token';
    let release!: () => void;
    const provider: MarketDataProvider = {
      getQuotes: vi.fn(() => new Promise<AssetQuote[]>((resolve) => { release = () => resolve([]); })),
    };
    const { buildApp } = await loadApp();
    const app = buildApp({ withDatabase: false, prisma: makeDatabase(), quoteProvider: provider });

    const first = app.inject({ method: 'POST', url: '/quotes/refresh' });
    await vi.waitFor(() => expect(provider.getQuotes).toHaveBeenCalledOnce());
    const second = await app.inject({ method: 'POST', url: '/quotes/refresh' });

    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('QUOTES_REFRESH_IN_PROGRESS');
    release();
    await first;
    await app.close();
  });
});
