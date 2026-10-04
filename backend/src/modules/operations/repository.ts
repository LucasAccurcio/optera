import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

export class OperationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: Prisma.OperationCreateInput) {
    return this.prisma.operation.create({ data });
  }

  findById(id: string) {
    return this.prisma.operation.findUnique({
      where: { id },
      include: { closures: { orderBy: [{ closedAt: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  update(id: string, data: Prisma.OperationUpdateInput) {
    return this.prisma.operation.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.operation.delete({ where: { id } });
  }

  findMany(
    where: Prisma.OperationWhereInput,
    orderBy: Prisma.OperationOrderByWithRelationInput
  ) {
    return this.prisma.operation.findMany({
      where,
      include: { closures: { orderBy: [{ closedAt: 'asc' }, { createdAt: 'asc' }] } },
      orderBy,
    });
  }

  async findAvailableForStrategy(): Promise<[any[], number]> {
    const operations = await this.prisma.operation.findMany({
      where: { strategyId: null },
      include: { closures: { select: { quantity: true } } },
      orderBy: { expirationDate: 'asc' },
    });
    const available = operations.filter((operation) => {
      const closedQuantity = operation.closures.reduce(
        (total, closure) => total + closure.quantity,
        0,
      );
      return closedQuantity < operation.quantity;
    });
    return [available.slice(0, 100), available.length];
  }

  async findOpenAssets(): Promise<string[]> {
    const operations = await this.prisma.operation.findMany({
      select: { asset: true, quantity: true, closures: { select: { quantity: true } } },
    });
    return [...new Set(
      operations
        .filter((operation) => {
          const closedQuantity = operation.closures.reduce(
            (total, closure) => total + closure.quantity,
            0,
          );
          return closedQuantity < operation.quantity;
        })
        .map(({ asset }) => asset),
    )].sort((a, b) => a.localeCompare(b));
  }

  transaction<T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
