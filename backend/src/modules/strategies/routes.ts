import fp from "fastify-plugin";
import { z } from "zod";
import { AppError } from "../../shared/errors.js";
import {
  createStrategySchema,
  strategyIdSchema,
  strategyOperationSchema,
  updateStrategySchema,
} from "./schemas.js";
import { StrategyService } from "./service.js";

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request data",
      400,
      result.error.issues,
    );
  return result.data;
}

export default fp(async (app: any) => {
  const service = new StrategyService(app.prisma);
  app.get("/strategies", async () => service.list());
  app.get("/strategies/:id", async (request: any) => ({
    data: await service.getById(parse(strategyIdSchema, request.params).id),
  }));
  app.post("/strategies", async (request: any, reply: any) =>
    reply.code(201).send({
      data: await service.create(parse(createStrategySchema, request.body)),
    }),
  );
  app.patch("/strategies/:id", async (request: any) => ({
    data: await service.update(
      parse(strategyIdSchema, request.params).id,
      parse(updateStrategySchema, request.body),
    ),
  }));
  app.delete("/strategies/:id", async (request: any, reply: any) => {
    await service.remove(parse(strategyIdSchema, request.params).id);
    return reply.code(204).send();
  });
  app.post("/strategies/:id/operations", async (request: any) => ({
    data: await service.addOperation(
      parse(strategyIdSchema, request.params).id,
      parse(strategyOperationSchema, request.body).operationId,
    ),
  }));
  app.delete(
    "/strategies/:id/operations/:operationId",
    async (request: any) => ({
      data: await service.removeOperation(
        parse(strategyIdSchema, request.params).id,
        parse(strategyOperationSchema, request.params).operationId,
      ),
    }),
  );
});
