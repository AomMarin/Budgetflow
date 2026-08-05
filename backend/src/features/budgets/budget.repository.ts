import { Budget, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateBudgetDto, UpdateBudgetDto } from './budget.dto';

type Db = Prisma.TransactionClient | typeof prisma;

export class BudgetRepository {
  async findAll(userId: string): Promise<Budget[]> {
    return prisma.budget.findMany({
      where: { userId, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string, userId: string): Promise<Budget | null> {
    return prisma.budget.findFirst({ where: { id, userId } });
  }

  async create(userId: string, data: CreateBudgetDto, db: Db = prisma): Promise<Budget> {
    const count = await db.budget.count({ where: { userId } });
    return db.budget.create({
      data: { ...data, userId, sortOrder: count },
    });
  }

  async update(id: string, userId: string, data: UpdateBudgetDto, db: Db = prisma): Promise<Budget> {
    return db.budget.update({ where: { id, userId }, data });
  }

  async archive(id: string, userId: string): Promise<Budget> {
    return prisma.budget.update({
      where: { id, userId },
      data: { isArchived: true },
    });
  }

  async delete(id: string, userId: string): Promise<Budget> {
    return prisma.budget.delete({ where: { id, userId } });
  }

  async updateAmounts(
    id: string,
    userId: string,
    data: { allocatedAmount?: Prisma.Decimal | number; spentAmount?: Prisma.Decimal | number },
  ): Promise<Budget> {
    return prisma.budget.update({ where: { id, userId }, data });
  }

  async incrementSpent(id: string, amount: number): Promise<Budget> {
    return prisma.budget.update({
      where: { id },
      data: { spentAmount: { increment: amount } },
    });
  }

  async decrementSpent(id: string, amount: number): Promise<Budget> {
    return prisma.budget.update({
      where: { id },
      data: { spentAmount: { decrement: amount } },
    });
  }

  async updateAlertLevel(id: string, level: number | null): Promise<void> {
    await prisma.budget.update({ where: { id }, data: { lastAlertedLevel: level } });
  }

  // Single aggregate for both sums so callers never need a second round trip
  // (and can't accidentally read allocatedAmount without spentAmount, see
  // BudgetService's use of totalRemaining).
  async getAllocationTotals(userId: string, db: Db = prisma): Promise<{ totalAllocated: number; totalSpent: number }> {
    const result = await db.budget.aggregate({
      where: { userId, isArchived: false },
      _sum: { allocatedAmount: true, spentAmount: true },
    });
    return {
      totalAllocated: Number(result._sum.allocatedAmount ?? 0),
      totalSpent: Number(result._sum.spentAmount ?? 0),
    };
  }
}
