import { Prisma } from '@prisma/client';
import { getBangkokYearMonth, isBeforeYearMonth } from './period';

export function closedPeriodError(): Error {
  return Object.assign(
    new Error(
      'รายการนี้อยู่ในเดือนที่ปิดแล้ว แก้ไขไม่ได้\nหากต้องการปรับปรุง ให้บันทึกรายการใหม่ในเดือนปัจจุบันแทน',
    ),
    { status: 400, code: 'PERIOD_CLOSED' },
  );
}

// Shared by transaction.service.ts and pool.service.ts (reverseContribution)
// — anything that decrements/reverses a budget's spentAmount for a specific
// past date must not touch a month that's already been closed and folded
// into BudgetMonthlyHistory. `date` is compared against each budget's OWN
// periodYear/periodMonth (not "now") since different budgets can close at
// different times.
export async function assertBudgetsPeriodOpen(
  tx: Prisma.TransactionClient,
  budgetIds: string[],
  date: Date,
): Promise<void> {
  if (budgetIds.length === 0) return;
  const budgets = await tx.budget.findMany({
    where: { id: { in: budgetIds } },
    select: { periodYear: true, periodMonth: true },
  });
  const txPeriod = getBangkokYearMonth(date);
  for (const b of budgets) {
    if (isBeforeYearMonth(txPeriod, { year: b.periodYear, month: b.periodMonth })) {
      throw closedPeriodError();
    }
  }
}
