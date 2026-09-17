import { Budget, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateBudgetDto, UpdateBudgetDto } from './budget.dto';

type Db = Prisma.TransactionClient | typeof prisma;

export class BudgetRepository {
  async findAll(userId: string, db: Db = prisma): Promise<Budget[]> {
    return db.budget.findMany({
      where: { userId, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string, userId: string): Promise<Budget | null> {
    return prisma.budget.findFirst({ where: { id, userId } });
  }

  async create(userId: string, data: CreateBudgetDto, db: Db = prisma): Promise<Budget> {
    const count = await db.budget.count({ where: { userId } });
    const budget = await db.budget.create({
      data: { ...data, userId, sortOrder: count },
    });
    // A new budget has no prior session to mirror into — create its first
    // one here, atomically alongside the Budget row (same db/tx param).
    await db.budgetSession.create({
      data: {
        budgetId: budget.id,
        userId,
        periodYear: budget.periodYear,
        periodMonth: budget.periodMonth,
        allocatedAmount: budget.allocatedAmount,
        spentAmount: budget.spentAmount,
        rolloverPolicy: budget.rolloverPolicy,
        status: 'OPEN',
      },
    });
    return budget;
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

  // Month-switcher historical read. No isArchived filter — a budget archived
  // after the queried month must still show up in that month's history, same
  // reasoning migrate-budget-sessions.ts already used to justify inserting
  // archived budgets' sessions as CLOSED rather than dropping them. Sorted in
  // JS (not via a relation orderBy) to stay independent of Prisma-version
  // support for ordering by a to-one relation's field.
  async findAllForPeriod(
    userId: string,
    year: number,
    month: number,
    db: Db = prisma,
  ): Promise<Prisma.BudgetSessionGetPayload<{ include: { budget: true } }>[]> {
    const sessions = await db.budgetSession.findMany({
      where: { userId, periodYear: year, periodMonth: month },
      include: { budget: true },
    });
    return sessions.sort((a, b) => a.budget.sortOrder - b.budget.sortOrder);
  }

  // Powers the month switcher's "can't go back further" bound. No isArchived
  // filter, same reasoning as findAllForPeriod above.
  async hasSessionBefore(userId: string, year: number, month: number, db: Db = prisma): Promise<boolean> {
    const earlier = await db.budgetSession.findFirst({
      where: {
        userId,
        OR: [{ periodYear: { lt: year } }, { periodYear: year, periodMonth: { lt: month } }],
      },
      select: { id: true },
    });
    return earlier !== null;
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
