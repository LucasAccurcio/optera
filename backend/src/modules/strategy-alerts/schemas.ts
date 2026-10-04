import { Decimal } from 'decimal.js';
import { z } from 'zod';

const positiveDecimalString = z
  .string()
  .regex(/^\d+(?:\.\d{1,6})?$/)
  .refine((value) => new Decimal(value).greaterThan(0), 'price must be greater than zero');

export const strategyAssetPriceSchema = z.object({
  price: positiveDecimalString,
});

export type StrategyAssetPriceInput = z.infer<typeof strategyAssetPriceSchema>;
