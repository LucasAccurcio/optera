import fp from 'fastify-plugin';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { strategyIdSchema } from '../strategies/schemas.js';
import { StrategyAlertsService } from './service.js';
import { strategyAssetPriceSchema } from './schemas.js';

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Invalid request data',
      400,
      result.error.issues,
    );
  }
  return result.data;
}

export default fp(async (app: any) => {
  const service = new StrategyAlertsService(app.prisma);

  app.get('/strategies/:id/alerts', async (request: any) => ({
    data: await service.getAlerts(parse(strategyIdSchema, request.params).id),
  }));
  app.post('/strategies/:id/asset-price', async (request: any) => ({
    data: await service.setManualAssetPrice(
      parse(strategyIdSchema, request.params).id,
      parse(strategyAssetPriceSchema, request.body).price,
    ),
  }));
  app.get('/strategies/:id/simulation', async (request: any) => ({
    data: await service.getSimulation(parse(strategyIdSchema, request.params).id),
  }));
});
