import { prisma } from '../../config/database';

export class ReportsService {
  async getMonthlyReport(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [typeSummary, budgetBreakdown, dailySpending, budgets] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['type'],
        where: { userId, date: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: true,
      }),

      prisma.transaction.groupBy({
        by: ['budgetId'],
        where: { userId, type: 'EXPENSE', date: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: true,
      }),

      prisma.$queryRaw<{ day: number; total: number }[]>`
        SELECT EXTRACT(DAY FROM date)::int AS day, SUM(amount)::float AS total
        FROM transactions
        WHERE user_id = ${userId}
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

    const totalIncome = Number(typeSummary.find((t) => t.type === 'INCOME')?._sum.amount ?? 0);
    const totalExpense = Number(typeSummary.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0);

    const budgetMap = Object.fromEntries(budgets.map((b) => [b.id, b]));
    const budgetBreakdownWithNames = budgetBreakdown
      .filter((b) => b.budgetId)
      .map((b) => ({
        budget: budgetMap[b.budgetId!] ?? { name: 'Uncategorized', icon: '❓', color: '#9CA3AF' },
        amount: Number(b._sum.amount ?? 0),
        count: b._count,
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
      WHERE user_id = ${userId}
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
}
