import type { Prisma, PrismaClient } from "@prisma/client";

const operationInclude = {
  operations: { orderBy: { createdAt: "asc" as const } },
};

export class StrategyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: Prisma.StrategyCreateInput) {
    return this.prisma.strategy.create({ data, include: operationInclude });
  }

  findById(id: string) {
    return this.prisma.strategy.findUnique({
      where: { id },
      include: operationInclude,
    });
  }

  findMany() {
    return this.prisma.strategy.findMany({
      include: operationInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  update(id: string, data: Prisma.StrategyUpdateInput) {
    return this.prisma.strategy.update({
      where: { id },
      data,
      include: operationInclude,
    });
  }

  delete(id: string) {
    return this.prisma.strategy.delete({ where: { id } });
  }

  findOperation(id: string) {
    return this.prisma.operation.findUnique({ where: { id } });
  }

  associateOperation(operationId: string, strategyId: string) {
    return this.prisma.operation.update({
      where: { id: operationId },
      data: { strategy: { connect: { id: strategyId } } },
    });
  }

  dissociateOperation(operationId: string) {
    return this.prisma.operation.update({
      where: { id: operationId },
      data: { strategy: { disconnect: true } },
    });
  }
}
