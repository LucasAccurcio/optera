import fp from "fastify-plugin";
import { z } from "zod";
import { AppError } from "../../shared/errors.js";
import {
  closeOperationSchema,
  createOperationSchema,
  operationIdSchema,
  operationListQuerySchema,
  simulationSchema,
  updateOperationSchema,
} from "./schemas.js";
import { OperationService } from "./service.js";

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
  const service = new OperationService(app.prisma);

  app.get("/operations", async (request: any) =>
    service.list(parse(operationListQuerySchema, request.query)),
  );
  app.get("/operations/available-for-strategy", async () =>
    service.listAvailableForStrategy(),
  );
  app.get("/operations/:id", async (request: any) => ({
    data: await service.getById(parse(operationIdSchema, request.params).id),
  }));
  app.post("/operations", async (request: any, reply: any) =>
    reply
      .code(201)
      .send({
        data: await service.create(parse(createOperationSchema, request.body)),
      }),
  );
  app.patch("/operations/:id", async (request: any) => ({
    data: await service.update(
      parse(operationIdSchema, request.params).id,
      parse(updateOperationSchema, request.body),
    ),
  }));
  app.patch("/operations/:id/simulation", async (request: any) => ({
    data: await service.updateSimulation(
      parse(operationIdSchema, request.params).id,
      parse(simulationSchema, request.body).simulatedClosingPrice,
    ),
  }));
  app.post("/operations/:id/close", async (request: any) => ({
    data: await service.close(
      parse(operationIdSchema, request.params).id,
      parse(closeOperationSchema, request.body),
    ),
  }));
  app.delete("/operations/:id", async (request: any, reply: any) => {
    await service.remove(parse(operationIdSchema, request.params).id);
    return reply.code(204).send();
  });
});
