import type { Prisma, PrismaClient } from '@prisma/client';

export class OperationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: Prisma.OperationCreateInput) {
    return this.prisma.operation.create({ data });
  }

  findById(id: string) {
    return this.prisma.operation.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.OperationUpdateInput) {
    return this.prisma.operation.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.operation.delete({ where: { id } });
  }

  findMany(where: Prisma.OperationWhereInput, skip: number, take: number, orderBy: Prisma.OperationOrderByWithRelationInput) {
    return Promise.all([
      this.prisma.operation.findMany({ where, skip, take, orderBy }),
      this.prisma.operation.count({ where }),
    ]);
  }

  findAvailableForStrategy() {
    const where: Prisma.OperationWhereInput = {
      closedAt: null,
      strategyId: null,
    };
    return Promise.all([
      this.prisma.operation.findMany({
        where,
        take: 100,
        orderBy: { expirationDate: "asc" },
      }),
      this.prisma.operation.count({ where }),
    ]);
  }

  async findOpenAssets(): Promise<string[]> {
    const operations = await this.prisma.operation.findMany({
      where: { closedAt: null },
      select: { asset: true },
      distinct: ['asset'],
      orderBy: { asset: 'asc' },
    });
    return operations.map(({ asset }) => asset);
  }
}
