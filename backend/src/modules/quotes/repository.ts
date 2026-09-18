import type { Prisma, PrismaClient } from '@prisma/client';
import type { AssetQuote } from './types.js';

export type QuoteRecord = Prisma.AssetQuoteGetPayload<{}>;

export class QuoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByAssets(assets: string[]): Promise<QuoteRecord[]> {
    return this.prisma.assetQuote.findMany({
      where: { asset: { in: assets } },
      orderBy: { asset: 'asc' },
    });
  }

  findAll(): Promise<QuoteRecord[]> {
    return this.prisma.assetQuote.findMany({ orderBy: { asset: 'asc' } });
  }

  upsertSuccess(quote: AssetQuote): Promise<QuoteRecord> {
    const data = {
      price: quote.price,
      timestamp: new Date(quote.timestamp),
      source: quote.source,
      delayed: quote.delayed,
      lastError: null,
    };
    return this.prisma.assetQuote.upsert({
      where: { asset: quote.asset },
      create: { asset: quote.asset, ...data },
      update: data,
    });
  }

  recordFailure(asset: string, message: string): Promise<QuoteRecord> {
    return this.prisma.assetQuote.upsert({
      where: { asset },
      create: {
        asset,
        price: null,
        timestamp: null,
        source: 'brapi',
        delayed: true,
        lastError: message,
      },
      update: { lastError: message },
    });
  }
}
