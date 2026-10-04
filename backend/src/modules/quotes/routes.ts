import fp from 'fastify-plugin';
import { env } from '../../config/env.js';
import { OperationRepository } from '../operations/repository.js';
import { BrapiMarketDataProvider } from './provider.js';
import { QuoteRepository } from './repository.js';
import { QuoteService } from './service.js';
import type { MarketDataProvider } from './types.js';

export type QuoteRoutesOptions = {
  provider?: MarketDataProvider;
};

export default fp(async (app: any, options: QuoteRoutesOptions) => {
  const service = new QuoteService({
    provider: options.provider ?? new BrapiMarketDataProvider({ token: env.brapiToken }),
    repository: new QuoteRepository(app.prisma),
    operations: new OperationRepository(app.prisma),
    tokenAvailable: Boolean(env.brapiToken),
  });

  app.get('/quotes', async () => service.getAll());
  app.post('/quotes/refresh', async () => service.refresh());
});
