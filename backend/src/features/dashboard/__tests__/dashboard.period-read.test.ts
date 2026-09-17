import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { RolloverPolicy } from '@prisma/client';
import { DashboardService } from '../dashboard.service';
import { BudgetService } from '../../budgets/budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';
import { getBangkokYearMonth, nextYearMonth } from '../../../utils/period';

function bkk(year: number, month: number, day = 10): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

async function setPeriod(budgetId: string, year: number, month: number, extra: Record<string, unknown> = {}) {
  return prisma.budget.update({ where: { id: budgetId }, data: { periodYear: year, periodMonth: month, ...extra } });
}

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
describe('DashboardService.getSummaryForPeriod', () => {
  let ctx: TestUserContext;
  const dashboardService = new DashboardService();
  const budgetService = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('current period matches the live getSummary() path exactly, plus the period field', async () => {
    await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 400 });
    const current = getBangkokYearMonth();

    const live = await dashboardService.getSummary(ctx.userId);
    const withPeriod = await dashboardService.getSummaryForPeriod(ctx.userId, current.year, current.month);

    expect(withPeriod).toEqual({
      ...live,
      period: { year: current.year, month: current.month, hasPrevious: false, isCurrent: true },
    });
  });

  it('rejects a period after the current one', async () => {
    const current = getBangkokYearMonth();
    const future = nextYearMonth(current);

    await expect(
      dashboardService.getSummaryForPeriod(ctx.userId, future.year, future.month),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('a genuinely closed historical month reads frozen BudgetSession numbers, bounds recentTransactions/monthlyIncome/monthlyExpense to that month, and always returns empty alerts', async () => {
    const budget = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    const current = getBangkokYearMonth();
    const past = monthsBefore(current, 2);
    await setPeriod(budget.id, past.year, past.month, { rolloverPolicy: RolloverPolicy.SWEEP, spentAmount: 200 });

    // Created directly (not via TransactionService) — this test only exercises
    // DashboardService's own read/aggregation, not transaction side-effects
    // (already covered by transaction.service tests).
    await prisma.transaction.create({
      data: {
        userId: ctx.userId,
        accountId: ctx.accountId,
        budgetId: budget.id,
        type: 'EXPENSE',
        amount: 200,
        description: 'old expense',
        date: bkk(past.year, past.month, 5),
      },
    });
    await prisma.transaction.create({
      data: {
        userId: ctx.userId,
        accountId: ctx.accountId,
        type: 'INCOME',
        amount: 300,
        description: 'old income',
        date: bkk(past.year, past.month, 20),
      },
    });
    // Dated in the real current month — must NOT leak into the historical view.
    await prisma.transaction.create({
      data: {
        userId: ctx.userId,
        accountId: ctx.accountId,
        type: 'INCOME',
        amount: 999,
        description: 'this month, should not appear',
        date: new Date(),
      },
    });

    // getSummaryForPeriod's internal getForPeriod call does the lazy
    // catch-up close itself — no separate closeAndAdvancePeriodsForUser call
    // needed here.
    const summary = await dashboardService.getSummaryForPeriod(ctx.userId, past.year, past.month);

    expect(summary.period).toEqual({ year: past.year, month: past.month, hasPrevious: false, isCurrent: false });
    expect(summary.monthlyIncome).toBe(300);
    expect(summary.monthlyExpense).toBe(200);
    expect(summary.recentTransactions).toHaveLength(2);
    expect(summary.recentTransactions.every((tx) => tx.description !== 'this month, should not appear')).toBe(true);
    expect(summary.alerts).toEqual([]);
    expect(summary.totalBalance).toBe(1000); // live account balance — this app has no historical balance tracking

    expect(summary.budgets).toHaveLength(1);
    expect(Number(summary.budgets[0].allocatedAmount)).toBe(500);
    expect(Number(summary.budgets[0].spentAmount)).toBe(200);
    expect(summary.totalBudget).toBe(500);
    expect(summary.totalSpent).toBe(200);
    expect(summary.totalRemaining).toBe(300);
  });
});
