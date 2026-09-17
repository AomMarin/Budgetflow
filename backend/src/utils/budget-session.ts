import { Prisma, RolloverPolicy } from '@prisma/client';

// Phase A of the session-based budget model: BudgetSession is a live mirror
// of Budget.allocatedAmount/spentAmount, kept in sync by every write site
// that touches those columns. Nothing reads BudgetSession yet — Budget's own
// columns remain the source of truth. See
// C:\Users\ammar\.claude\plans\kind-dancing-sparrow.md.
//
// updateMany({ where: { budgetId, status: 'OPEN' } }) instead of update by id
// means callers never need to look up the session id first, and the partial
// unique index budget_sessions_one_open_per_budget guarantees at most one row
// matches. If zero rows match (session missing — shouldn't happen
// post-backfill), this is a silent no-op: acceptable for Phase A since
// nothing reads the mirror yet, and month-close self-corrects it (see
// commitMonthClose in budget.service.ts).
export async function mirrorSessionAmount(
  tx: Prisma.TransactionClient,
  budgetId: string,
  delta: { spentAmount?: number; allocatedAmount?: number },
): Promise<void> {
  await tx.budgetSession.updateMany({
    where: { budgetId, status: 'OPEN' },
    data: {
      ...(delta.spentAmount !== undefined && { spentAmount: { increment: delta.spentAmount } }),
      ...(delta.allocatedAmount !== undefined && { allocatedAmount: { increment: delta.allocatedAmount } }),
    },
  });
}

// BudgetSession.rolloverPolicy is a snapshot of "whatever policy was in
// effect while this period was open" (same semantics BudgetMonthlyHistory
// already established), not a live pointer at Budget.rolloverPolicy — the
// month-switcher's historical read (getForPeriod) reads it as exactly that.
// BudgetService.update() is the only place a budget's policy changes outside
// month-close, so it's the only other call site that needs this — a policy
// edit mid-month must reach the current OPEN session immediately, or the
// snapshot silently stays wrong (stuck at whatever policy the budget had at
// creation/last close) for the rest of that period.
export async function mirrorSessionRolloverPolicy(
  tx: Prisma.TransactionClient,
  budgetId: string,
  rolloverPolicy: RolloverPolicy,
): Promise<void> {
  await tx.budgetSession.updateMany({
    where: { budgetId, status: 'OPEN' },
    data: { rolloverPolicy },
  });
}
