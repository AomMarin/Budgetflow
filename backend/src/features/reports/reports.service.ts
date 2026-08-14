import { prisma } from '../../config/database';
import { BudgetService } from '../budgets/budget.service';
import { getExpenseByBudget } from '../../utils/split-aware-spend';

export class ReportsService {
  constructor(private readonly budgetService = new BudgetService()) {}

  private async getPeriodTotals(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<{ income: number; expense: number }> {
    const typeSummary = await prisma.transaction.groupBy({
      by: ['type'],
      where: { userId, date: { gte: start, lte: end } },
      _sum: { amount: true },
    });

    return {
      income: Number(typeSummary.find((t) => t.type === 'INCOME')?._sum.amount ?? 0),
      expense: Number(typeSummary.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0),
    };
  }

  private async getMonthToDateSpendByBudget(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<Record<string, number>> {
    const byBudget = await getExpenseByBudget(userId, start, end);
    return Object.fromEntries(Object.entries(byBudget).map(([budgetId, entry]) => [budgetId, entry.amount]));
  }

  async getMonthlyReport(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [{ income: totalIncome, expense: totalExpense }, budgetBreakdown, dailySpending, budgets] =
      await Promise.all([
        this.getPeriodTotals(userId, startDate, endDate),

        getExpenseByBudget(userId, startDate, endDate),

        prisma.$queryRaw<{ day: number; total: number }[]>`
        SELECT EXTRACT(DAY FROM date)::int AS day, SUM(amount)::float AS total
        FROM transactions
        WHERE "userId" = ${userId}
          AND type = 'EXPENSE'
          AND date >= ${startDate}
          AND date <= ${endDate}
        GROUP BY EXTRACT(DAY FROM date)
        ORDER BY day
      `,

        prisma.budget.findMany({
          where: { userId },
          select: { id: true, name: true, icon: true, color: true, allocatedAmount: true, spentAmount: true },
        }),
      ]);

    const budgetMap = Object.fromEntries(budgets.map((b) => [b.id, b]));
    const budgetBreakdownWithNames = Object.entries(budgetBreakdown)
      .map(([budgetId, entry]) => ({
        budget: budgetMap[budgetId] ?? { name: 'Uncategorized', icon: '❓', color: '#9CA3AF' },
        amount: entry.amount,
        count: entry.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      year,
      month,
      totalIncome,
      totalExpense,
      netSavings: totalIncome - totalExpense,
      budgetBreakdown: budgetBreakdownWithNames,
      dailySpending,
    };
  }

  async getYearlyReport(userId: string, year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const monthly = await prisma.$queryRaw<
      { month: number; type: string; total: number }[]
    >`
      SELECT EXTRACT(MONTH FROM date)::int AS month, type, SUM(amount)::float AS total
      FROM transactions
      WHERE "userId" = ${userId}
        AND date >= ${startDate}
        AND date <= ${endDate}
      GROUP BY EXTRACT(MONTH FROM date), type
      ORDER BY month
    `;

    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const income = monthly.find((r) => r.month === m && r.type === 'INCOME')?.total ?? 0;
      const expense = monthly.find((r) => r.month === m && r.type === 'EXPENSE')?.total ?? 0;
      return { month: m, income: Number(income), expense: Number(expense), savings: Number(income) - Number(expense) };
    });

    return { year, months };
  }

  async getForecast(userId: string, year: number, month: number) {
    const now = new Date();
    const startDate = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;
    const endDate = isCurrentMonth ? now : new Date(year, month, 0, 23, 59, 59);

    const [monthToDateSpend, budgets] = await Promise.all([
      this.getMonthToDateSpendByBudget(userId, startDate, endDate),
      this.budgetService.getAll(userId),
    ]);

    return budgets.map((budget) => {
      const spend = monthToDateSpend[budget.id] ?? 0;
      const allocated = Number(budget.allocatedAmount);
      const dailyRate = daysElapsed > 0 ? spend / daysElapsed : 0;
      const projectedSpend = isCurrentMonth ? dailyRate * daysInMonth : spend;
      const projectedPercent = allocated > 0 ? Math.round((projectedSpend / allocated) * 100) : 0;

      const status: 'WILL_EXCEED' | 'AT_RISK' | 'ON_TRACK' =
        projectedSpend > allocated ? 'WILL_EXCEED' : projectedPercent >= 80 ? 'AT_RISK' : 'ON_TRACK';

      return {
        budgetId: budget.id,
        name: budget.name,
        icon: budget.icon,
        color: budget.color,
        allocatedAmount: allocated,
        monthToDateSpend: spend,
        projectedSpend: Math.round(projectedSpend * 100) / 100,
        projectedPercent,
        status,
      };
    });
  }

  async getMonthOverMonth(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevStartDate = new Date(prevYear, prevMonth - 1, 1);
    const prevEndDate = new Date(prevYear, prevMonth, 0, 23, 59, 59);

    const [current, previous] = await Promise.all([
      this.getPeriodTotals(userId, startDate, endDate),
      this.getPeriodTotals(userId, prevStartDate, prevEndDate),
    ]);

    const pctChange = (curr: number, prev: number): number => {
      if (prev === 0) return curr === 0 ? 0 : 100;
      return Math.round(((curr - prev) / Math.abs(prev)) * 100);
    };

    const currentSavings = current.income - current.expense;
    const previousSavings = previous.income - previous.expense;

    return {
      current,
      previous,
      incomeChangePct: pctChange(current.income, previous.income),
      expenseChangePct: pctChange(current.expense, previous.expense),
      savingsChangePct: pctChange(currentSavings, previousSavings),
    };
  }

  async getRecommendations(userId: string, year: number, month: number) {
    const forecast = await this.getForecast(userId, year, month);
    const budgets = await this.budgetService.getAll(userId);

    const underspent = budgets
      .filter((b) => b.usagePercent < 50)
      .sort((a, b) => b.remainingAmount - a.remainingAmount);

    const recommendations: Array<
      | {
          type: 'TRANSFER_SUGGESTION';
          budgetId: string;
          budgetName: string;
          projectedOverage: number;
          suggestedSourceBudgetId: string;
          suggestedSourceName: string;
          suggestedAmount: number;
        }
      | { type: 'REDUCE_SPENDING'; budgetId: string; budgetName: string; projectedOverage: number }
    > = [];

    for (const item of forecast) {
      if (item.status !== 'WILL_EXCEED') continue;
      const shortfall = Math.round((item.projectedSpend - item.allocatedAmount) * 100) / 100;

      const source = underspent.find((b) => b.id !== item.budgetId && b.remainingAmount >= shortfall);

      if (source) {
        recommendations.push({
          type: 'TRANSFER_SUGGESTION',
          budgetId: item.budgetId,
          budgetName: item.name,
          projectedOverage: shortfall,
          suggestedSourceBudgetId: source.id,
          suggestedSourceName: source.name,
          suggestedAmount: shortfall,
        });
      } else {
        recommendations.push({
          type: 'REDUCE_SPENDING',
          budgetId: item.budgetId,
          budgetName: item.name,
          projectedOverage: shortfall,
        });
      }
    }

    return recommendations;
  }

  async getInsights(userId: string, year: number, month: number) {
    const [monthOverMonth, forecast, recommendations] = await Promise.all([
      this.getMonthOverMonth(userId, year, month),
      this.getForecast(userId, year, month),
      this.getRecommendations(userId, year, month),
    ]);

    return { monthOverMonth, forecast, recommendations };
  }
}
