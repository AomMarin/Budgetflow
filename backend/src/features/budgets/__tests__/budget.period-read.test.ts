import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { RolloverPolicy } from '@prisma/client';
import { BudgetService } from '../budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';
import { getBangkokYearMonth, nextYearMonth, bangkokMonthRangeUtc } from '../../../utils/period';

async function setPeriod(budgetId: string, year: number, month: number, extra: Record<string, unknown> = {}) {
  return prisma.budget.update({ where: { id: budgetId }, data: { periodYear: year, periodMonth: month, ...extra } });
}

// Exactly N months behind `ym` — used instead of a hardcoded past year (e.g.
// 2020) so closeAndAdvancePeriodsForUser's catch-up loop only ever runs a
// small, fixed number of iterations regardless of how far "today" has
// drifted since this test was written.
function monthsBefore({ year, month }: { year: number; month: number }, n: number): { year: number; month: number } {
  let y = year;
  let m = month - n;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
}

// See C:\Users\ammar\.claude\plans\linear-honking-hamming.md, Verification §1.
// getForPeriod() has no injectable "now" (unlike closeAndAdvancePeriodsForUser)
// — it always reads the real wall clock — so every test here anchors off a
// freshly-captured getBangkokYearMonth() rather than a hardcoded date.
describe('BudgetService.getForPeriod', () => {
  let ctx: TestUserContext;
  const service = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('current period matches the live getAll() path exactly', async () => {
    await service.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 400 });
    const current = getBangkokYearMonth();

    const live = await service.getAll(ctx.userId);
    const { budgets, period } = await service.getForPeriod(ctx.userId, current.year, current.month);

    expect(period).toEqual({ year: current.year, month: current.month, hasPrevious: false, isCurrent: true });
    expect(budgets).toEqual(live);
  });

  it('rejects a period after the current one', async () => {
    const current = getBangkokYearMonth();
    const future = nextYearMonth(current);

    await expect(service.getForPeriod(ctx.userId, future.year, future.month)).rejects.toMatchObject({ status: 400 });
  });

  it('a period nobody has any session for returns an empty array, not an error', async () => {
    const { budgets, period } = await service.getForPeriod(ctx.userId, 1999, 1);

    expect(budgets).toEqual([]);
    expect(period).toMatchObject({ year: 1999, month: 1, hasPrevious: false, isCurrent: false });
  });

  it('hasPrevious is true from a Transaction alone, even with zero BudgetSession history — an INCOME row (never guarded by assertBudgetsPeriodOpen) or an imported one can predate every budget', async () => {
    await service.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 400 });
    const current = getBangkokYearMonth();
    const past = monthsBefore(current, 2);

    // No setPeriod()/close involved — this budget's only session is the one
    // OPEN session at `current`. Created directly, matching how INCOME
    // (never budget-guarded) or a CSV import (guard bypassed entirely) can
    // record a date this old in real production.
    await prisma.transaction.create({
      data: {
        userId: ctx.userId,
        accountId: ctx.accountId,
        type: 'INCOME',
        amount: 500,
        description: 'old income, predates any budget/session',
        date: bangkokMonthRangeUtc(past.year, past.month).start,
      },
    });

    const { period } = await service.getForPeriod(ctx.userId, current.year, current.month);
    expect(period.hasPrevious).toBe(true);
  });

  it('a genuinely closed historical month returns the frozen BudgetSession numbers, including an archived budget, and hasPrevious flips correctly at the boundary', async () => {
    const budget = await service.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    const current = getBangkokYearMonth();
    const past = monthsBefore(current, 2);
    // Force this budget into a genuinely past period (test-only fixture
    // shortcut, same convention as budget.period-close.test.ts's setPeriod())
    // — safe because commitMonthClose now stamps periodYear/periodMonth
    // explicitly onto the session it closes (see that fix's comment).
    await setPeriod(budget.id, past.year, past.month, { rolloverPolicy: RolloverPolicy.SWEEP, spentAmount: 200 });

    // Close `past` forward to whatever's really "now" — closeAndAdvancePeriodsForUser
    // defaults to new Date(), matching getForPeriod's own real-clock notion
    // of "current" so the two never disagree about what's future/past.
    await service.closeAndAdvancePeriodsForUser(ctx.userId);
    await prisma.budget.update({ where: { id: budget.id }, data: { isArchived: true } });

    const { budgets, period } = await service.getForPeriod(ctx.userId, past.year, past.month);
    expect(period).toEqual({ year: past.year, month: past.month, hasPrevious: false, isCurrent: false });

    expect(budgets).toHaveLength(1);
    const found = budgets[0];
    expect(found.id).toBe(budget.id);
    expect(Number(found.allocatedAmount)).toBe(500);
    expect(Number(found.spentAmount)).toBe(200);
    expect(found.remainingAmount).toBe(300);
    expect(found.isArchived).toBe(true); // still shown — historical fidelity, not filtered by current archive state
    expect(found.periodYear).toBe(past.year);
    expect(found.periodMonth).toBe(past.month);
    expect(found.rolloverPolicy).toBe(RolloverPolicy.SWEEP);

    // Viewing the real current month now: a closed month exists behind it.
    const currentView = await service.getForPeriod(ctx.userId, current.year, current.month);
    expect(currentView.period.isCurrent).toBe(true);
    expect(currentView.period.hasPrevious).toBe(true);
  });
});
