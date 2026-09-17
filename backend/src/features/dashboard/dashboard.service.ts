import { prisma } from '../../config/database';
import { getExpenseByBudget } from '../../utils/split-aware-spend';
import { BudgetService, PeriodMeta } from '../budgets/budget.service';
import { getBangkokYearMonth, isBeforeYearMonth, bangkokMonthRangeUtc } from '../../utils/period';

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

  // Month-switcher read path — additive, sits alongside getSummary() rather
  // than replacing it (household.service.ts calls getSummary() directly for
  // the family overview and must keep getting today's live shape). Current
  // period still goes through the unchanged getSummary() body; only a past
  // period reads BudgetSession (via BudgetService.getForPeriod) and re-derives
  // the transaction-based figures over that month's date range instead of
  // "now". See C:\Users\ammar\.claude\plans\linear-honking-hamming.md.
  async getSummaryForPeriod(userId: string, year: number, month: number) {
    const current = getBangkokYearMonth();
    if (isBeforeYearMonth(current, { year, month })) {
      throw Object.assign(new Error('ยังไม่ถึงเดือนนี้'), { status: 400 });
    }
    const isCurrent = year === current.year && month === current.month;

    if (isCurrent) {
      const summary = await this.getSummary(userId);
      const hasPrevious = await this.budgetService.hasPreviousPeriod(userId, year, month);
      const period: PeriodMeta = { year, month, hasPrevious, isCurrent: true };
      return { ...summary, period };
    }

    const { budgets, period } = await this.budgetService.getForPeriod(userId, year, month);
    const { start, end } = bangkokMonthRangeUtc(year, month);

    const [account, monthlyTotals, recentTransactions] = await Promise.all([
      prisma.account.aggregate({ where: { userId }, _sum: { balance: true } }),
      prisma.transaction.groupBy({
        by: ['type'],
        where: { userId, date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      // Bounded to the viewed month, unlike getSummary()'s "5 most recent
      // ever" — a global "recent" reading makes no sense for a frozen past
      // month.
      prisma.transaction.findMany({
        where: { userId, date: { gte: start, lte: end } },
        include: { budget: { select: { name: true, icon: true, color: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
    ]);

    // This app has no historical balance tracking at all — Account.balance
    // is always the current, live figure. Showing anything else here would
    // fabricate data, so the historical response deliberately still surfaces
    // today's real balance rather than a reconstructed one.
    const totalBalance = Number(account._sum.balance ?? 0);

    const totalBudget = budgets.reduce((s, b) => s + Number(b.allocatedAmount), 0);
    const totalSpent = budgets.reduce((s, b) => s + Number(b.spentAmount), 0);
    const totalRemaining = totalBudget - totalSpent;

    const monthlyIncome = Number(monthlyTotals.find((t) => t.type === 'INCOME')?._sum.amount ?? 0);
    const monthlyExpense = Number(monthlyTotals.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0);

    return {
      totalBalance,
      totalBudget,
      totalSpent,
      totalRemaining,
      monthlyIncome,
      monthlyExpense,
      budgets,
      recentTransactions,
      // Alerts are a live, lastAlertedLevel-deduped notification concept,
      // not period-scoped — doesn't apply to a frozen snapshot.
      alerts: [],
      period,
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
