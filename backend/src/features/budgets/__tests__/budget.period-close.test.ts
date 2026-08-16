import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { RolloverPolicy } from '@prisma/client';
import { BudgetService } from '../budget.service';
import { TransactionService } from '../../transactions/transaction.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, assertZeroBasedInvariant, TestUserContext } from '../../../test/helpers';

// Mid-day UTC so the Bangkok (UTC+7) calendar date never crosses a day
// boundary — avoids off-by-one flakiness near midnight.
function bkk(year: number, month: number, day = 15): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

async function setPeriod(budgetId: string, year: number, month: number, extra: Record<string, unknown> = {}) {
  return prisma.budget.update({ where: { id: budgetId }, data: { periodYear: year, periodMonth: month, ...extra } });
}

describe('BudgetService.closeAndAdvancePeriodsForUser', () => {
  let ctx: TestUserContext;
  const budgetService = new BudgetService();
  const txService = new TransactionService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('SWEEP zeroes both allocated and spent, and records history for the closed month', async () => {
    const b = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(b.id, 2026, 1, { rolloverPolicy: RolloverPolicy.SWEEP, spentAmount: 200 });

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));

    const after = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    expect(Number(after.allocatedAmount)).toBe(0);
    expect(Number(after.spentAmount)).toBe(0);
    expect(after.periodYear).toBe(2026);
    expect(after.periodMonth).toBe(2);

    const history = await prisma.budgetMonthlyHistory.findUniqueOrThrow({
      where: { budgetId_year_month: { budgetId: b.id, year: 2026, month: 1 } },
    });
    expect(Number(history.allocatedAmount)).toBe(500);
    expect(Number(history.spentAmount)).toBe(200);
    expect(history.rolloverPolicy).toBe(RolloverPolicy.SWEEP);

    await assertZeroBasedInvariant(ctx.userId);
  });

  it('ROLLOVER carries max(allocated - spent, 0) forward, leaving remaining unchanged', async () => {
    const b = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(b.id, 2026, 1, { rolloverPolicy: RolloverPolicy.ROLLOVER, spentAmount: 200 });

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));

    const after = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    expect(Number(after.allocatedAmount)).toBe(300); // 500 - 200, remaining preserved exactly
    expect(Number(after.spentAmount)).toBe(0);

    await assertZeroBasedInvariant(ctx.userId);
  });

  it('ROLLOVER clamps to 0 for legacy data where spent already exceeded allocated', async () => {
    const b = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 100 });
    await setPeriod(b.id, 2026, 1, { rolloverPolicy: RolloverPolicy.ROLLOVER, spentAmount: 400 });

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));

    const after = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    expect(Number(after.allocatedAmount)).toBe(0);
    expect(Number(after.spentAmount)).toBe(0);

    await assertZeroBasedInvariant(ctx.userId);
  });

  it('RESET tops up to monthlyTarget when the pool has enough room (fully-funded)', async () => {
    await prisma.account.update({ where: { id: ctx.accountId }, data: { balance: 2000 } });
    const b = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(b.id, 2026, 1, {
      rolloverPolicy: RolloverPolicy.RESET,
      monthlyTarget: 800,
      spentAmount: 500, // remaining = 0
    });

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));

    const after = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    expect(Number(after.allocatedAmount)).toBe(800);
    expect(Number(after.spentAmount)).toBe(0);

    await assertZeroBasedInvariant(ctx.userId);
  });

  it('RESET caps the top-up at whatever pool is actually available (partial-fill)', async () => {
    await prisma.account.update({ where: { id: ctx.accountId }, data: { balance: 300 } });
    const b = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 300 });
    await setPeriod(b.id, 2026, 1, {
      rolloverPolicy: RolloverPolicy.RESET,
      monthlyTarget: 800,
      spentAmount: 300, // remaining = 0, pool = balance(300) - totalRemaining(0) = 300
    });

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));

    const after = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    expect(Number(after.allocatedAmount)).toBe(300); // capped by pool, not the 800 target
    await assertZeroBasedInvariant(ctx.userId);
  });

  it('RESET gives zero top-up when the pool is fully consumed by existing remaining', async () => {
    const b = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 1000 });
    await setPeriod(b.id, 2026, 1, {
      rolloverPolicy: RolloverPolicy.RESET,
      monthlyTarget: 1500,
      spentAmount: 0, // remaining = 1000 = full balance -> pool = 0
    });

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));

    const after = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    expect(Number(after.allocatedAmount)).toBe(1000); // unchanged, no room to top up
    await assertZeroBasedInvariant(ctx.userId);
  });

  it('RESET: two budgets competing for the same pool are settled first-come-first-served by sortOrder', async () => {
    const a = await budgetService.create(ctx.userId, { name: 'A', icon: '🅰️', color: '#3B82F6', allocatedAmount: 200 });
    const b = await budgetService.create(ctx.userId, { name: 'B', icon: '🅱️', color: '#EF4444', allocatedAmount: 200 });
    expect(a.sortOrder).toBeLessThan(b.sortOrder); // created in order -> A is sortOrder 0

    await setPeriod(a.id, 2026, 1, { rolloverPolicy: RolloverPolicy.RESET, monthlyTarget: 600, spentAmount: 200 });
    await setPeriod(b.id, 2026, 1, { rolloverPolicy: RolloverPolicy.RESET, monthlyTarget: 600, spentAmount: 200 });
    // balance=1000, both start at remaining=0 -> pool=1000 before pass 2 begins

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));

    const afterA = await prisma.budget.findUniqueOrThrow({ where: { id: a.id } });
    const afterB = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    expect(Number(afterA.allocatedAmount)).toBe(600); // fully funded first
    expect(Number(afterB.allocatedAmount)).toBe(400); // only 1000-600=400 left in the pool
    await assertZeroBasedInvariant(ctx.userId);
  });

  it('is idempotent: calling again with the same "now" does not change anything or duplicate history', async () => {
    const b = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(b.id, 2026, 1, { rolloverPolicy: RolloverPolicy.ROLLOVER, spentAmount: 200 });

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));
    const once = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));
    const twice = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });

    expect(twice).toEqual(once);
    const historyCount = await prisma.budgetMonthlyHistory.count({ where: { budgetId: b.id } });
    expect(historyCount).toBe(1);
  });

  it('closes several skipped months one at a time, leaving a history row for every month in between', async () => {
    const b = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 100 });
    await setPeriod(b.id, 2026, 1, { rolloverPolicy: RolloverPolicy.SWEEP, spentAmount: 50 });

    // January is behind; catch all the way up to April in one call.
    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 4));

    const after = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.periodYear).toBe(2026);
    expect(after.periodMonth).toBe(4);

    const history = await prisma.budgetMonthlyHistory.findMany({
      where: { budgetId: b.id },
      orderBy: { month: 'asc' },
    });
    expect(history.map((h) => h.month)).toEqual([1, 2, 3]); // Jan, Feb, Mar all closed, none skipped
  });

  it('closes cleanly when the budget has TransactionSplit rows from a borrow', async () => {
    const food = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 100 });
    const emergency = await budgetService.create(ctx.userId, { name: 'Emergency', icon: '🆘', color: '#EF4444', allocatedAmount: 900 });
    await setPeriod(food.id, 2026, 1, { rolloverPolicy: RolloverPolicy.SWEEP });
    await setPeriod(emergency.id, 2026, 1, { rolloverPolicy: RolloverPolicy.SWEEP });

    await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 150,
      type: 'EXPENSE',
      description: 'big dinner',
      date: bkk(2026, 1).toISOString(),
      borrowFromBudgetId: emergency.id,
    });
    const splitsBefore = await prisma.transactionSplit.findMany({ where: { budgetId: food.id } });
    expect(splitsBefore).toHaveLength(1);

    await budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2));

    // TransactionSplit rows are a historical breadcrumb, untouched by close.
    const splitsAfter = await prisma.transactionSplit.findMany({ where: { budgetId: food.id } });
    expect(splitsAfter).toHaveLength(1);
    await assertZeroBasedInvariant(ctx.userId);
  });

  it('concurrent calls (cron vs. a lazy hook) racing for the same pool never double-spend it', async () => {
    const a = await budgetService.create(ctx.userId, { name: 'A', icon: '🅰️', color: '#3B82F6', allocatedAmount: 200 });
    const b = await budgetService.create(ctx.userId, { name: 'B', icon: '🅱️', color: '#EF4444', allocatedAmount: 200 });
    await setPeriod(a.id, 2026, 1, { rolloverPolicy: RolloverPolicy.RESET, monthlyTarget: 600, spentAmount: 200 });
    await setPeriod(b.id, 2026, 1, { rolloverPolicy: RolloverPolicy.RESET, monthlyTarget: 600, spentAmount: 200 });

    await Promise.all([
      budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2)),
      budgetService.closeAndAdvancePeriodsForUser(ctx.userId, bkk(2026, 2)),
    ]);

    const afterA = await prisma.budget.findUniqueOrThrow({ where: { id: a.id } });
    const afterB = await prisma.budget.findUniqueOrThrow({ where: { id: b.id } });
    // Same result as the single-call sortOrder test — the second racer must
    // see the first one's committed writes (via lockUser), not stale totals.
    expect(Number(afterA.allocatedAmount)).toBe(600);
    expect(Number(afterB.allocatedAmount)).toBe(400);
    await assertZeroBasedInvariant(ctx.userId);

    const historyCountA = await prisma.budgetMonthlyHistory.count({ where: { budgetId: a.id } });
    const historyCountB = await prisma.budgetMonthlyHistory.count({ where: { budgetId: b.id } });
    expect(historyCountA).toBe(1);
    expect(historyCountB).toBe(1);
  });
});
