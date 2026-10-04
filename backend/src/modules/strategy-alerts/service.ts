import type { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { calculateVerticalSpreadExpirationResult } from '../../shared/financial/index.js';
import { AppError } from '../../shared/errors.js';
import { StrategyService } from '../strategies/service.js';
import { buildStrategyAlertView } from './domain.js';

export class StrategyAlertsService {
  private readonly strategyService: StrategyService;
  private readonly manualAssetPrices = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaClient,
    strategyService?: StrategyService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.strategyService = strategyService ?? new StrategyService(prisma);
  }

  async getAlerts(strategyId: string) {
    const strategy = await this.strategyService.getById(strategyId);
    const asset = strategy.asset.trim().toUpperCase();
    const quote = await this.prisma.assetQuote.findUnique({ where: { asset } });
    const assetPrice = quote?.price?.toString() ?? null;
    const quoteTimestamp = quote?.timestamp?.toISOString() ?? null;
    return buildStrategyAlertView(strategy, assetPrice, this.now(), quoteTimestamp);
  }

  async setManualAssetPrice(strategyId: string, value: string) {
    const strategy = await this.strategyService.getById(strategyId);
    let price: Decimal;
    try {
      price = new Decimal(value);
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Invalid manual asset price');
    }
    if (!price.isFinite() || !price.greaterThan(0)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid manual asset price');
    }
    const serializedPrice = price.toString();
    this.manualAssetPrices.set(strategyId, serializedPrice);
    return { strategyId, asset: strategy.asset, assetPrice: serializedPrice };
  }

  async getSimulation(strategyId: string) {
    const strategy = await this.strategyService.getById(strategyId);
    const assetPrice = this.manualAssetPrices.get(strategyId) ?? null;
    const analysis = strategy.spreadAnalysis;
    if (assetPrice === null || analysis?.status !== 'supported') {
      return {
        strategyId,
        asset: strategy.asset,
        assetPrice,
        strategyType: analysis?.status === 'supported' ? analysis.strategyType : null,
        scenario: null,
        result: null,
        maxProfit: null,
        maxLoss: null,
        breakeven: null,
      };
    }

    const spot = new Decimal(assetPrice);
    const lowerStrike = new Decimal(analysis.lowerStrike);
    const higherStrike = new Decimal(analysis.higherStrike);
    const scenario = spot.lessThanOrEqualTo(lowerStrike)
      ? 'below_min'
      : spot.greaterThanOrEqualTo(higherStrike)
        ? 'above_max'
        : 'between';

    return {
      strategyId,
      asset: strategy.asset,
      assetPrice,
      strategyType: analysis.strategyType,
      scenario,
      result: calculateVerticalSpreadExpirationResult(analysis, assetPrice),
      maxProfit: analysis.maxProfit,
      maxLoss: analysis.maxLoss,
      breakeven: analysis.breakeven,
    };
  }
}
