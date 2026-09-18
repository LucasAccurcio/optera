import fp from "fastify-plugin";
import { SummaryService } from "./service.js";

export default fp(async (app: any) => {
  const service = new SummaryService(app.prisma);
  app.get("/summary", async () => ({ data: await service.getSummary() }));
});
