import { randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

const bearStrategyId = '4f6d8d13-5e23-4f64-8e38-08ea34a1f2d1';
const bullStrategyId = '5f6d8d13-5e23-4f64-8e38-08ea34a1f2d1';
const closeStrategyId = '6f6d8d13-5e23-4f64-8e38-08ea34a1f2d1';
const failingStrategyId = '7f6d8d13-5e23-4f64-8e38-08ea34a1f2d1';

function operation(options: {
  id: string;
  strategyId: string;
  asset: string;
  optionType: 'CALL' | 'PUT';
  side: 'BUY' | 'SELL';
  strike: string;
  quantity: number;
  entryPremium: string;
  simulatedClosingPrice: string;
}) {
  const now = new Date('2026-01-10T00:00:00.000Z');
  return {
    id: options.id,
    asset: options.asset,
    optionTicker: `${options.asset}VTEST`,
    optionType: options.optionType,
    side: options.side,
    expirationDate: new Date('2026-12-18T00:00:00.000Z'),
    strike: new Decimal(options.strike),
    quantity: options.quantity,
    openedAt: now,
    entryPremium: new Decimal(options.entryPremium),
    simulatedClosingPrice: new Decimal(options.simulatedClosingPrice),
    closures: [] as any[],
    strategyId: options.strategyId,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

function verticalLegs(
  strategyId: string,
  asset: string,
  optionType: 'CALL' | 'PUT',
  longStrike: string,
  shortStrike: string,
  prefix: string,
) {
  return [
    operation({
      id: randomUUID(),
      strategyId,
      asset,
      optionType,
      side: 'BUY',
      strike: longStrike,
      quantity: 200,
      entryPremium: '1.64',
      simulatedClosingPrice: '1.2',
    }),
    operation({
      id: randomUUID(),
      strategyId,
      asset,
      optionType,
      side: 'SELL',
      strike: shortStrike,
      quantity: 200,
      entryPremium: '0.69',
      simulatedClosingPrice: '0.2',
    }),
  ];
}

function strategy(id: string, asset: string, type: string, operations: any[]) {
  const now = new Date('2026-01-10T00:00:00.000Z');
  return {
    id,
    name: `Strategy ${id}`,
    asset,
    type,
    openedAt: now,
    notes: null,
    createdAt: now,
    updatedAt: now,
    operations,
  };
}

function makeDatabase() {
  const bearLegs = verticalLegs(bearStrategyId, 'BBSE3', 'PUT', '41.70', '39.45', 'bear');
  const bullLegs = verticalLegs(bullStrategyId, 'PETR4', 'CALL', '39.45', '41.70', 'bull');
  const closeLegs = verticalLegs(closeStrategyId, 'VALE3', 'PUT', '41.70', '39.45', 'close');
  for (const leg of closeLegs) {
    leg.closures.push({
      id: `prior-${leg.id}`,
      operationId: leg.id,
      quantity: 50,
      actualClosingPrice: new Decimal(leg.side === 'BUY' ? '1.8' : '0.4'),
      closedAt: new Date('2026-09-24T00:00:00.000Z'),
      createdAt: new Date('2026-09-24T12:00:00.000Z'),
    });
  }
  const failingLegs = verticalLegs(failingStrategyId, 'ITUB4', 'PUT', '41.70', '39.45', 'fail');
  const strategies = [
    strategy(bearStrategyId, 'BBSE3', 'BEAR_PUT', bearLegs),
    strategy(bullStrategyId, 'PETR4', 'BULL_CALL', bullLegs),
    strategy(closeStrategyId, 'VALE3', 'BEAR_PUT', closeLegs),
    strategy(failingStrategyId, 'ITUB4', 'BEAR_PUT', failingLegs),
  ];
  const operations = strategies.flatMap((item) => item.operations);
  const assetQuotes = [
    { asset: 'BBSE3', price: new Decimal('39'), timestamp: new Date('2026-09-25T12:00:00.000Z'), source: 'brapi', delayed: true, lastError: null },
    { asset: 'PETR4', price: new Decimal('42.2'), timestamp: new Date('2026-09-25T12:00:00.000Z'), source: 'brapi', delayed: true, lastError: null },
    { asset: 'VALE3', price: new Decimal('40'), timestamp: new Date('2026-09-25T12:00:00.000Z'), source: 'brapi', delayed: true, lastError: null },
    { asset: 'ITUB4', price: new Decimal('40'), timestamp: new Date('2026-09-25T12:00:00.000Z'), source: 'brapi', delayed: true, lastError: null },
  ].map((quote) => ({ ...quote, id: quote.asset, createdAt: quote.timestamp, updatedAt: quote.timestamp }));
  let failClosureFor: string | null = null;

  const findStrategy = (id: string) => strategies.find((item) => item.id === id) ?? null;
  const findOperation = (id: string) => operations.find((item) => item.id === id) ?? null;
  const strategyDelegate = {
    findUnique: async ({ where }: any) => findStrategy(where.id),
    findMany: async () => strategies,
  };
  const operationDelegate = {
    findUnique: async ({ where }: any) => findOperation(where.id),
    findMany: async ({ where }: any = {}) => operations.filter((item) =>
      where.strategyId ? item.strategyId === where.strategyId : true),
  };
  const operationClosureDelegate = {
    create: async ({ data }: any) => {
      if (data.operationId === failClosureFor) throw new Error('simulated closure persistence failure');
      const current = findOperation(data.operationId);
      if (!current) throw new Error('operation not found');
      const record = { id: randomUUID(), ...data, createdAt: new Date('2026-09-27T12:00:00.000Z') };
      current.closures.push(record);
      return record;
    },
  };
  const assetQuoteDelegate = {
    findUnique: async ({ where }: any) => assetQuotes.find((quote) => quote.asset === where.asset) ?? null,
    findMany: async ({ where }: any = {}) => where.asset?.in
      ? assetQuotes.filter((quote) => where.asset.in.includes(quote.asset))
      : assetQuotes,
  };
  let transactionTail = Promise.resolve();
  const $transaction = async (callback: any) => {
    let release!: () => void;
    const previous = transactionTail;
    transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshots = operations.map((item) => [item, [...item.closures]] as const);
    try {
      return await callback({
        strategy: strategyDelegate,
        operation: operationDelegate,
        operationClosure: operationClosureDelegate,
      });
    } catch (error) {
      for (const [item, closures] of snapshots) item.closures = closures;
      throw error;
    } finally {
      release();
    }
  };

  return {
    prisma: {
      strategy: strategyDelegate,
      operation: operationDelegate,
      operationClosure: operationClosureDelegate,
      assetQuote: assetQuoteDelegate,
      $transaction,
    },
    strategies,
    operations,
    assetQuotes,
    setFailClosureFor: (operationId: string | null) => { failClosureFor = operationId; },
  };
}

describe('strategy alerts and expiration scenarios', () => {
  const database = makeDatabase();
  const app = buildApp({
    withDatabase: false,
    prisma: database.prisma as any,
    quoteProvider: { getQuotes: async () => [] },
  });

  afterAll(async () => {
    await app.close();
  });

  it('classifies both supported spread types from stored quotes and simulates without mutating market or option values', async () => {
    const bearAlerts = await app.inject({ method: 'GET', url: `/strategies/${bearStrategyId}/alerts` });
    expect(bearAlerts.statusCode).toBe(200);
    expect(bearAlerts.json().data.legs.map((leg: any) => leg.moneyness)).toEqual(['ITM', 'ITM']);
    expect(bearAlerts.json().data.alerts).toContainEqual(expect.objectContaining({
      type: 'both_legs_itm',
      strategyType: 'BEAR_PUT',
    }));

    const bearQuote = database.assetQuotes.find((quote) => quote.asset === 'BBSE3')!;
    bearQuote.price = new Decimal('41.5');
    const bearAtm = await app.inject({ method: 'GET', url: `/strategies/${bearStrategyId}/alerts` });
    expect(bearAtm.json().data.legs.map((leg: any) => leg.moneyness)).toEqual(['ATM', 'OTM']);
    expect(bearAtm.json().data.alerts.some((alert: any) => alert.type === 'both_legs_itm')).toBe(false);
    bearQuote.price = new Decimal('39');

    const bullAlerts = await app.inject({ method: 'GET', url: `/strategies/${bullStrategyId}/alerts` });
    expect(bullAlerts.statusCode).toBe(200);
    expect(bullAlerts.json().data.legs.map((leg: any) => leg.moneyness)).toEqual(['ITM', 'ITM']);
    expect(bullAlerts.json().data.alerts).toContainEqual(expect.objectContaining({
      type: 'both_legs_itm',
      strategyType: 'BULL_CALL',
    }));

    const bullQuote = database.assetQuotes.find((quote) => quote.asset === 'PETR4')!;
    bullQuote.price = new Decimal('41.5');
    const bullAtm = await app.inject({ method: 'GET', url: `/strategies/${bullStrategyId}/alerts` });
    expect(bullAtm.json().data.legs.map((leg: any) => leg.moneyness)).toEqual(['ITM', 'ATM']);
    expect(bullAtm.json().data.alerts.some((alert: any) => alert.type === 'both_legs_itm')).toBe(false);
    bullQuote.price = new Decimal('42.2');

    const setPrice = await app.inject({
      method: 'POST',
      url: `/strategies/${bearStrategyId}/asset-price`,
      payload: { price: '40.50' },
    });
    expect(setPrice.statusCode).toBe(200);
    const simulation = await app.inject({ method: 'GET', url: `/strategies/${bearStrategyId}/simulation` });
    expect(simulation.statusCode).toBe(200);
    expect(simulation.json().data).toMatchObject({
      assetPrice: '40.5',
      strategyType: 'BEAR_PUT',
      scenario: 'between',
      result: '50',
    });
    expect(database.assetQuotes.find((quote) => quote.asset === 'BBSE3')?.price.toString()).toBe('39');
    expect(database.operations.filter((item) => item.strategyId === bearStrategyId).map((item) => item.simulatedClosingPrice.toString())).toEqual(['1.2', '0.2']);

    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const bearOperations = database.operations.filter((item) => item.strategyId === bearStrategyId);
    for (const item of bearOperations) item.expirationDate = yesterday;
    const expired = await app.inject({ method: 'GET', url: `/strategies/${bearStrategyId}/alerts` });
    expect(expired.json().data.expirationStatus).toBe('VENCIDA');
    expect(expired.json().data.status).toBe('OPEN');
    expect(expired.json().data.realizedResult).toBe('0');
    expect(bearOperations.every((item) => item.closures.length === 0)).toBe(true);
  });

  it('closes all remaining strategy quantities atomically', async () => {
    const closeLegs = database.operations.filter((item) => item.strategyId === closeStrategyId);
    const closed = await app.inject({
      method: 'POST',
      url: `/strategies/${closeStrategyId}/close`,
      payload: {
        legs: [
          { operationId: closeLegs[0].id, quantity: 150, actualClosingPrice: '0.9', closedAt: '2026-09-25' },
          { operationId: closeLegs[1].id, quantity: 150, actualClosingPrice: '0.2', closedAt: '2026-09-25' },
        ],
      },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().data.status).toBe('CLOSED');
    const closedOperations = database.operations.filter((item) => item.strategyId === closeStrategyId);
    expect(closedOperations.map((item) => item.closures.map((closure: any) => closure.quantity))).toEqual([[50, 150], [50, 150]]);
    expect(closedOperations.map((item) => item.closures.reduce((sum: number, closure: any) => sum + closure.quantity, 0))).toEqual([200, 200]);

    const failingLegs = database.operations.filter((item) => item.strategyId === failingStrategyId);
    database.setFailClosureFor(failingLegs[1].id);
    const failed = await app.inject({
      method: 'POST',
      url: `/strategies/${failingStrategyId}/close`,
      payload: {
        legs: [
          { operationId: failingLegs[0].id, quantity: failingLegs[0].quantity, actualClosingPrice: '0.9', closedAt: '2026-09-25' },
          { operationId: failingLegs[1].id, quantity: failingLegs[1].quantity, actualClosingPrice: '0.2', closedAt: '2026-09-25' },
        ],
      },
    });
    expect(failed.statusCode).toBeGreaterThanOrEqual(400);
    expect(database.operations.filter((item) => item.strategyId === failingStrategyId).every((item) => item.closures.length === 0)).toBe(true);
  });
});
