import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD format");

export const createStrategySchema = z.object({
  name: z.string().trim().min(1).max(120),
  asset: z.string().trim().min(1).max(40),
  type: z.string().trim().max(60).nullable().optional(),
  openedAt: dateOnly,
  notes: z.string().max(2000).nullable().optional(),
});

export const updateStrategySchema = createStrategySchema.partial();
export const strategyIdSchema = z.object({ id: z.string().uuid() });
export const strategyOperationSchema = z.object({
  operationId: z.string().uuid(),
});

export type CreateStrategyInput = z.infer<typeof createStrategySchema>;
export type UpdateStrategyInput = z.infer<typeof updateStrategySchema>;
