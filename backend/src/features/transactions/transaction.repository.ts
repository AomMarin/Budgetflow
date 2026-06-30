import { Transaction, TransactionType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { TransactionFilters } from './transaction.dto';

export class TransactionRepository {
  async findAll(userId: string, filters: TransactionFilters) {
    const { type, budgetId, startDate, endDate, search, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {
      userId,
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
        include: { budget: { select: { id: true, name: true, icon: true, color: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return { transactions, total };
  }

  async findById(id: string, userId: string) {
    return prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        budget: { select: { id: true, name: true, icon: true, color: true } },
        account: { select: { id: true, name: true } },
      },
    });
  }

  async create(data: Prisma.TransactionUncheckedCreateInput) {
    return prisma.transaction.create({
      data,
      include: { budget: { select: { id: true, name: true, icon: true, color: true } } },
    });
  }

  async update(id: string, userId: string, data: Prisma.TransactionUpdateInput) {
    return prisma.transaction.update({
      where: { id, userId },
      data,
      include: { budget: { select: { id: true, name: true, icon: true, color: true } } },
    });
  }

  async delete(id: string, userId: string) {
    return prisma.transaction.delete({ where: { id, userId } });
  }

  async getMonthlySummary(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    return prisma.transaction.groupBy({
      by: ['type'],
      where: { userId, date: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    });
  }
}
