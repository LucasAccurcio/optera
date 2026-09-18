import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

export default fp(async (app: any) => {
  const prisma = new PrismaClient();
  await prisma.$connect();
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => prisma.$disconnect());
});
