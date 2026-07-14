import { Budget } from '@prisma/client';
import { BudgetRepository } from './budget.repository';
import { CreateBudgetDto, UpdateBudgetDto, AllocateIncomeDto } from './budget.dto';
import { prisma } from '../../config/database';

export interface BudgetWithStats extends Budget {
  remainingAmount: number;
  usagePercent: number;
  alertLevel: '80' | '90' | '100' | null;
}

export class BudgetService {
  constructor(private readonly repo = new BudgetRepository()) {}

  private async getTotalBalance(userId: string): Promise<number> {
    const result = await prisma.account.aggregate({
      where: { userId },
      _sum: { balance: true },
    });
    return Number(result._sum.balance ?? 0);
  }

  async getAll(userId: string): Promise<BudgetWithStats[]> {
    const budgets = await this.repo.findAll(userId);
    return budgets.map(this.addStats);
  }

  async getById(id: string, userId: string): Promise<BudgetWithStats> {
    const budget = await this.repo.findById(id, userId);
    if (!budget) throw Object.assign(new Error('Budget not found'), { status: 404 });
    return this.addStats(budget);
  }

  async create(userId: string, dto: CreateBudgetDto): Promise<BudgetWithStats> {
    const [totalAllocated, totalBalance] = await Promise.all([
      this.repo.getTotalAllocated(userId),
      this.getTotalBalance(userId),
    ]);
    const available = totalBalance - totalAllocated;
    if (dto.allocatedAmount > available) {
      throw Object.assign(
        new Error(`จัดสรรเกินยอดคงเหลือ จัดสรรได้อีก ${available.toFixed(2)} บาท`),
        { status: 400 },
      );
    }
    const budget = await this.repo.create(userId, dto);
    return this.addStats(budget);
  }

  async update(id: string, userId: string, dto: UpdateBudgetDto): Promise<BudgetWithStats> {
    const existing = await this.getById(id, userId);

    if (dto.allocatedAmount !== undefined) {
      const [totalAllocated, totalBalance] = await Promise.all([
        this.repo.getTotalAllocated(userId),
        this.getTotalBalance(userId),
      ]);
      const available = totalBalance - (totalAllocated - Number(existing.allocatedAmount));
      if (dto.allocatedAmount > available) {
        throw Object.assign(
          new Error(`จัดสรรเกินยอดคงเหลือ จัดสรรได้สูงสุด ${available.toFixed(2)} บาท`),
          { status: 400 },
        );
      }
    }

    const budget = await this.repo.update(id, userId, dto);
    return this.addStats(budget);
  }

  async delete(id: string, userId: string): Promise<void> {
    const budget = await this.repo.findById(id, userId);
    if (!budget) throw Object.assign(new Error('Budget not found'), { status: 404 });

    const txCount = await prisma.transaction.count({ where: { budgetId: id } });
    if (txCount > 0) {
      await this.repo.archive(id, userId);
    } else {
      await this.repo.delete(id, userId);
    }
  }

  async allocateIncome(userId: string, dto: AllocateIncomeDto): Promise<void> {
    const account = await prisma.account.findFirst({
      where: { id: dto.accountId, userId },
    });
    if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

    const totalAllocating = dto.allocations.reduce((sum, a) => sum + a.amount, 0);
    if (totalAllocating > dto.totalAmount) {
      throw Object.assign(
        new Error('Total allocations exceed income amount'),
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      // Record income and increase account balance
      await tx.transaction.create({
        data: {
          userId,
          accountId: dto.accountId,
          type: 'INCOME',
          amount: dto.totalAmount,
          description: dto.note || 'Income',
          date: new Date(),
        },
      });

      await tx.account.update({
        where: { id: dto.accountId },
        data: { balance: { increment: dto.totalAmount } },
      });

      // Allocate to budgets
      for (const alloc of dto.allocations) {
        const budget = await tx.budget.findFirst({ where: { id: alloc.budgetId, userId } });
        if (!budget) throw new Error(`Budget ${alloc.budgetId} not found`);

        await tx.budget.update({
          where: { id: alloc.budgetId },
          data: { allocatedAmount: { increment: alloc.amount } },
        });

        await tx.allocation.create({
          data: {
            userId,
            budgetId: alloc.budgetId,
            amount: alloc.amount,
            note: dto.note,
          },
        });
      }
    });
  }

  async reorder(userId: string, orderedIds: string[]): Promise<void> {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.budget.updateMany({
          where: { id, userId },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  async checkAlerts(
    userId: string,
  ): Promise<Array<{ budgetId: string; name: string; level: 80 | 90 | 100; usagePercent: number }>> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];

    const budgets = await this.repo.findAll(userId);
    const triggered: Array<{ budgetId: string; name: string; level: 80 | 90 | 100; usagePercent: number }> = [];

    for (const budget of budgets) {
      const stats = this.addStats(budget);
      const currentLevel = stats.alertLevel ? (Number(stats.alertLevel) as 80 | 90 | 100) : null;
      const storedLevel = budget.lastAlertedLevel as 80 | 90 | 100 | null;

      if (currentLevel === storedLevel) continue;

      if (currentLevel !== null && (storedLevel === null || currentLevel > storedLevel)) {
        const prefEnabled =
          currentLevel === 80 ? user.alertAt80 : currentLevel === 90 ? user.alertAt90 : user.alertAt100;
        if (prefEnabled) {
          triggered.push({
            budgetId: budget.id,
            name: budget.name,
            level: currentLevel,
            usagePercent: stats.usagePercent,
          });
        }
      }

      await this.repo.updateAlertLevel(budget.id, currentLevel);
    }

    return triggered;
  }

  private addStats(budget: Budget): BudgetWithStats {
    const allocated = Number(budget.allocatedAmount);
    const spent = Number(budget.spentAmount);
    const remaining = allocated - spent;
    const usagePercent = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;

    let alertLevel: BudgetWithStats['alertLevel'] = null;
    if (usagePercent >= 100) alertLevel = '100';
    else if (usagePercent >= 90) alertLevel = '90';
    else if (usagePercent >= 80) alertLevel = '80';

    return { ...budget, remainingAmount: remaining, usagePercent, alertLevel };
  }
}
