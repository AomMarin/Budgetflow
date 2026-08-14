import { prisma } from '../config/database';

export interface BudgetSpendEntry {
  amount: number;
  count: number;
}

// EXPENSE spend grouped by budget for a date range, attributing borrowed
// overflow to its own budget instead of the transaction's primary budgetId.
// A transaction contributes via TransactionSplit rows if it has any
// (borrow case), otherwise via its own budgetId/amount (the common case) —
// see TransactionSplit in schema.prisma for why this is additive-only.
export async function getExpenseByBudget(
  userId: string,
  start: Date,
  end: Date,
): Promise<Record<string, BudgetSpendEntry>> {
  const [splitRows, plainRows] = await Promise.all([
    prisma.transactionSplit.groupBy({
      by: ['budgetId'],
      where: { transaction: { userId, type: 'EXPENSE', date: { gte: start, lte: end } } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ['budgetId'],
      where: {
        userId,
        type: 'EXPENSE',
        date: { gte: start, lte: end },
        budgetId: { not: null },
        splits: { none: {} },
      },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const result: Record<string, BudgetSpendEntry> = {};
  const add = (budgetId: string | null, amount: number, count: number) => {
    if (!budgetId) return;
    const cur = result[budgetId] ?? { amount: 0, count: 0 };
    result[budgetId] = { amount: cur.amount + amount, count: cur.count + count };
  };
  for (const r of plainRows) add(r.budgetId, Number(r._sum.amount ?? 0), r._count);
  for (const r of splitRows) add(r.budgetId, Number(r._sum.amount ?? 0), r._count);
  return result;
}
