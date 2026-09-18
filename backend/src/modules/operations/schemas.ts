import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD format");
const decimal = z
  .string()
  .regex(
    /^\d+(\.\d{1,6})?$/,
    "must be a non-negative decimal with up to 6 places",
  );

export const createOperationSchema = z.object({
  asset: z.string().trim().min(1).max(40),
  optionTicker: z.string().trim().min(1).max(40),
  optionType: z.enum(["CALL", "PUT"]),
  side: z.enum(["BUY", "SELL"]),
  expirationDate: dateOnly,
  strike: decimal,
  quantity: z.number().int().positive(),
  openedAt: dateOnly,
  entryPremium: decimal,
  strategyId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateOperationSchema = createOperationSchema.partial();
export const simulationSchema = z.object({ simulatedClosingPrice: decimal });
export const closeOperationSchema = z.object({
  closedAt: dateOnly,
  actualClosingPrice: decimal,
});

export const operationIdSchema = z.object({ id: z.string().uuid() });

export const operationListQuerySchema = z
  .object({
    status: z.enum(["ALL", "OPEN", "CLOSED"]).default("ALL"),
    asset: z.string().trim().min(1).max(40).optional(),
    optionType: z.enum(["CALL", "PUT"]).optional(),
    side: z.enum(["BUY", "SELL"]).optional(),
    strategyId: z.string().uuid().optional(),
    expirationFrom: dateOnly.optional(),
    expirationTo: dateOnly.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z
      .enum(["createdAt", "expirationDate", "openedAt", "asset"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .superRefine((value, context) => {
    if (
      value.expirationFrom &&
      value.expirationTo &&
      value.expirationFrom > value.expirationTo
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expirationFrom"],
        message: "must be before expirationTo",
      });
    }
  });

export type CreateOperationInput = z.infer<typeof createOperationSchema>;
export type UpdateOperationInput = z.infer<typeof updateOperationSchema>;
export type OperationListQuery = z.infer<typeof operationListQuerySchema>;
export type CloseOperationInput = z.infer<typeof closeOperationSchema>;
