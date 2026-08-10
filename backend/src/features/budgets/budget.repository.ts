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

  // totalRemaining is a floored per-budget sum (not totalAllocated - totalSpent):
  // if a budget's allocatedAmount is ever below its spentAmount (legacy data,
  // or a race), that single budget going negative must not inflate the
  // allocation headroom available to every other budget. See BudgetService.
  async getAllocationTotals(
    userId: string,
    db: Db = prisma,
  ): Promise<{ totalAllocated: number; totalSpent: number; totalRemaining: number }> {
    const budgets = await db.budget.findMany({
      where: { userId, isArchived: false },
      select: { allocatedAmount: true, spentAmount: true },
    });

    let totalAllocated = 0;
    let totalSpent = 0;
    let totalRemaining = 0;
    for (const b of budgets) {
      const allocated = Number(b.allocatedAmount);
      const spent = Number(b.spentAmount);
      totalAllocated += allocated;
      totalSpent += spent;
      totalRemaining += Math.max(allocated - spent, 0);
    }
    return { totalAllocated, totalSpent, totalRemaining };
  }
}
