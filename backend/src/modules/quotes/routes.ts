import fp from 'fastify-plugin';
import { env } from '../../config/env.js';
import { QuoteRepository } from './repository.js';
import { QuoteService } from './service.js';
import { BrapiMarketDataProvider } from './provider.js';
import type { MarketDataProvider } from './types.js';

export type QuoteRoutesOptions = {
  provider?: MarketDataProvider;
};

export default fp(async (app: any, options: QuoteRoutesOptions) => {
  const service = new QuoteService({
    provider: options.provider ?? new BrapiMarketDataProvider({ token: env.brapiToken }),
    repository: new QuoteRepository(app.prisma),
    operations: {
      findOpenAssets: () => app.prisma.operation.findMany({
        where: { closedAt: null },
        select: { asset: true },
        distinct: ['asset'],
        orderBy: { asset: 'asc' },
      }).then((operations: Array<{ asset: string }>) => operations.map(({ asset }) => asset)),
    },
    tokenAvailable: Boolean(env.brapiToken),
  });

  app.get('/quotes', async () => service.getAll());
  app.post('/quotes/refresh', async () => service.refresh());
});
