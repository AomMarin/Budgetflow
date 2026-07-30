import { Prisma, Account } from '@prisma/client';
import { prisma } from '../../../config/database';
import { TransactionFilters } from '../../transactions/transaction.dto';

export class PoolRepository {
  async getPoolAccount(poolUserId: string): Promise<Account | null> {
    return prisma.account.findFirst({ where: { userId: poolUserId, isDefault: true } });
  }

  async findTransactions(poolUserId: string, filters: TransactionFilters) {
    const { type, budgetId, startDate, endDate, search, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {
      userId: poolUserId,
      ...(type && { type }),
      ...(budgetId && { budgetId }),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate && { gte: new Date(startDate) }),
              ...(endDate && { lte: new Date(endDate) }),
            },
          }
        : {}),
      ...(search && {
        description: { contains: search, mode: Prisma.QueryMode.insensitive },
      }),
    };

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        include: {
          budget: { select: { id: true, name: true, icon: true, color: true } },
          actor: { select: { id: true, name: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return { transactions, total };
  }
}
