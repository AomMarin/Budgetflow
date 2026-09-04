import { prisma } from '../../config/database';
import { getExpenseByBudget } from '../../utils/split-aware-spend';
import { BudgetService } from '../budgets/budget.service';

export class DashboardService {
  constructor(private readonly budgetService = new BudgetService()) {}

  async getSummary(userId: string) {
    // Must run before the Promise.all below (not inside it) — account/budget
    // reads there have to see whatever this closes, same reason getAll() in
    // budget.service.ts calls it before its own read.
    await this.budgetService.closeAndAdvancePeriodsForUser(userId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [account, budgets, monthlyTotals, recentTransactions, budgetAlerts] = await Promise.all([
      // Account balance
      prisma.account.aggregate({
        where: { userId },
        _sum: { balance: true },
      }),

      // All budgets
      prisma.budget.findMany({
        where: { userId, isArchived: false },
        orderBy: { sortOrder: 'asc' },
      }),

      // Monthly income & expense
      prisma.transaction.groupBy({
        by: ['type'],
        where: { userId, date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),

      // Recent 5 transactions
      prisma.transaction.findMany({
        where: { userId },
        include: { budget: { select: { name: true, icon: true, color: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),

      // Budgets at 80%+ usage for alerts
      prisma.budget.findMany({
        where: { userId, isArchived: false },
        select: { id: true, name: true, icon: true, color: true, allocatedAmount: true, spentAmount: true },
      }),
    ]);

    const totalBalance = Number(account._sum.balance ?? 0);

    const budgetStats = budgets.map((b) => {
      const allocated = Number(b.allocatedAmount);
      const spent = Number(b.spentAmount);
      const remaining = allocated - spent;
      const usagePercent = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;
      return { ...b, remainingAmount: remaining, usagePercent };
    });

    const totalBudget = budgetStats.reduce((s, b) => s + Number(b.allocatedAmount), 0);
    const totalSpent = budgetStats.reduce((s, b) => s + Number(b.spentAmount), 0);
    const totalRemaining = totalBudget - totalSpent;

    const monthlyIncome = Number(
      monthlyTotals.find((t) => t.type === 'INCOME')?._sum.amount ?? 0,
    );
    const monthlyExpense = Number(
      monthlyTotals.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0,
    );

    const alerts = budgetAlerts
      .map((b) => {
        const pct = Number(b.allocatedAmount) > 0
          ? Math.round((Number(b.spentAmount) / Number(b.allocatedAmount)) * 100)
          : 0;
        return { ...b, usagePercent: pct };
      })
      .filter((b) => b.usagePercent >= 80)
      .sort((a, b) => b.usagePercent - a.usagePercent);

    return {
      totalBalance,
      totalBudget,
      totalSpent,
      totalRemaining,
      monthlyIncome,
      monthlyExpense,
      budgets: budgetStats,
      recentTransactions,
      alerts,
    };
  }

  async getSpendingByBudget(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const byBudget = await getExpenseByBudget(userId, startDate, endDate);
    return Object.entries(byBudget).map(([budgetId, entry]) => ({
      budgetId,
      _sum: { amount: entry.amount },
    }));
  }
}
