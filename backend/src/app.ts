import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { env } from "./config/env.js";
import prismaPlugin from "./plugins/prisma.js";
import operationRoutes from "./modules/operations/routes.js";
import strategyRoutes from "./modules/strategies/routes.js";
import summaryRoutes from "./modules/summary/routes.js";
import importRoutes from "./modules/imports/routes.js";
import quoteRoutes from "./modules/quotes/routes.js";
import type { MarketDataProvider } from "./modules/quotes/types.js";

export function buildApp(
  options: { withDatabase?: boolean; prisma?: any; quoteProvider?: MarketDataProvider } = {},
): FastifyInstance {
  const app = Fastify({
    logger: { level: env.logLevel },
    bodyLimit: 1_048_576,
  });
  app.register(cors, {
    origin: env.frontendOrigin,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.register(sensible);
  if (options.withDatabase !== false) app.register(prismaPlugin);
  else if (options.prisma) app.decorate("prisma", options.prisma);
  app.register(operationRoutes);
  app.register(strategyRoutes);
  app.register(summaryRoutes);
  app.register(importRoutes);
  app.register(quoteRoutes, { provider: options.quoteProvider });

  app.get("/health", async (_request: any, reply: any) => {
    let database = "not_configured";
    if (options.withDatabase !== false) {
      try {
        await app.prisma.$queryRaw`SELECT 1`;
        database = "up";
      } catch {
        database = "down";
      }
    }
    const healthy = database !== "down";
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      environment: env.nodeEnv,
      database,
    });
  });

  app.setErrorHandler((error: any, _request: any, reply: any) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: statusCode < 500 ? error.message : "Internal server error",
        details: error.details ?? [],
      },
    });
  });
  return app;
}
