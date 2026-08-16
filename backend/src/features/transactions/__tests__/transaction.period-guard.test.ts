import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TransactionService } from '../transaction.service';
import { BudgetService } from '../../budgets/budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';

function bkk(year: number, month: number, day = 15): string {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

async function setPeriod(budgetId: string, year: number, month: number) {
  await prisma.budget.update({ where: { id: budgetId }, data: { periodYear: year, periodMonth: month } });
}

describe('TransactionService — closed-period guard', () => {
  let ctx: TestUserContext;
  const txService = new TransactionService();
  const budgetService = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(10000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('create() rejects an EXPENSE backdated into an already-closed month', async () => {
    const food = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(food.id, 2026, 2); // budget's open month is Feb; Jan and earlier are closed

    await expect(
      txService.create(ctx.userId, {
        accountId: ctx.accountId,
        budgetId: food.id,
        amount: 100,
        type: 'EXPENSE',
        description: 'late entry',
        date: bkk(2026, 1),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'PERIOD_CLOSED' });
  });

  it('create() allows an EXPENSE dated in the budget\'s current open month', async () => {
    const food = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(food.id, 2026, 2);

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 100,
      type: 'EXPENSE',
      description: 'lunch',
      date: bkk(2026, 2),
    });
    expect(created.id).toBeTruthy();
  });

  it('create() ignores the guard for an EXPENSE with no budget attached', async () => {
    // No budget touched -> nothing for a closed month to protect, regardless of date.
    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      amount: 100,
      type: 'EXPENSE',
      description: 'cash withdrawal',
      date: bkk(2020, 1),
    });
    expect(created.id).toBeTruthy();
  });

  it('create() ignores the guard for INCOME tagged with a budget (spentAmount is never touched)', async () => {
    const food = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(food.id, 2026, 2);

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 100,
      type: 'INCOME',
      description: 'refund',
      date: bkk(2026, 1), // before the budget's period, but INCOME never touches spentAmount
    });
    expect(created.id).toBeTruthy();
  });

  it('update() rejects moving a transaction\'s date INTO an already-closed month', async () => {
    const food = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(food.id, 2026, 2);

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 100,
      type: 'EXPENSE',
      description: 'lunch',
      date: bkk(2026, 2), // open month, fine at creation time
    });

    await expect(
      txService.update(created.id, ctx.userId, { date: bkk(2026, 1) }), // Jan is closed relative to Feb
    ).rejects.toMatchObject({ status: 400, code: 'PERIOD_CLOSED' });
  });

  it('update() rejects touching a transaction whose OWN date already sits in a now-closed month', async () => {
    const food = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(food.id, 2026, 1);

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 100,
      type: 'EXPENSE',
      description: 'lunch',
      date: bkk(2026, 1), // open at creation time
    });

    // Simulate the monthly close having since run.
    await setPeriod(food.id, 2026, 2);

    await expect(
      txService.update(created.id, ctx.userId, { description: 'lunch (edited)' }),
    ).rejects.toMatchObject({ status: 400, code: 'PERIOD_CLOSED' });
  });

  it('delete() rejects a transaction whose date already sits in a now-closed month', async () => {
    const food = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(food.id, 2026, 1);

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 100,
      type: 'EXPENSE',
      description: 'lunch',
      date: bkk(2026, 1),
    });

    await setPeriod(food.id, 2026, 2); // close happens after creation

    await expect(txService.delete(created.id, ctx.userId)).rejects.toMatchObject({
      status: 400,
      code: 'PERIOD_CLOSED',
    });

    // Untouched — still there, side-effects never reversed.
    const stillThere = await prisma.transaction.findUnique({ where: { id: created.id } });
    expect(stillThere).not.toBeNull();
  });

  it('batchCreate() rejects the whole batch if any row is backdated into a closed month', async () => {
    const food = await budgetService.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 500 });
    await setPeriod(food.id, 2026, 2);

    await expect(
      txService.batchCreate(ctx.userId, [
        { accountId: ctx.accountId, budgetId: food.id, amount: 50, type: 'EXPENSE', description: 'ok', date: bkk(2026, 2) },
        { accountId: ctx.accountId, budgetId: food.id, amount: 50, type: 'EXPENSE', description: 'too old', date: bkk(2026, 1) },
      ]),
    ).rejects.toMatchObject({ status: 400, code: 'PERIOD_CLOSED' });

    const count = await prisma.transaction.count({ where: { userId: ctx.userId } });
    expect(count).toBe(0); // validated before any writes, batch is all-or-nothing
  });
});
