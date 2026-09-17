import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TransactionService } from '../transaction.service';
import { BudgetService } from '../../budgets/budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, assertSessionMirror, TestUserContext } from '../../../test/helpers';
import { bangkokMonthRangeUtc } from '../../../utils/period';

describe('TransactionService — EXPENSE side-effects', () => {
  let ctx: TestUserContext;
  const txService = new TransactionService();
  const budgetService = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('creating an EXPENSE decrements account balance and increments budget spentAmount', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });

    await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 200,
      type: 'EXPENSE',
      description: 'lunch',
      date: new Date().toISOString(),
    });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    const budget = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(account.balance)).toBe(800);
    expect(Number(budget.spentAmount)).toBe(200);
    await assertSessionMirror(ctx.userId);
  });

  it('blocks an EXPENSE that exceeds the budget remaining', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 300,
    });

    await expect(
      txService.create(ctx.userId, {
        accountId: ctx.accountId,
        budgetId: food.id,
        amount: 400,
        type: 'EXPENSE',
        description: 'too much',
        date: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ status: 400 });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    const budget = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(account.balance)).toBe(1000);
    expect(Number(budget.spentAmount)).toBe(0);
    await assertSessionMirror(ctx.userId);
  });

  it('editing a transaction reverses the original effect before applying the new one', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    const transport = await budgetService.create(ctx.userId, {
      name: 'Transport',
      icon: '🚗',
      color: '#EF4444',
      allocatedAmount: 400,
    });

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 200,
      type: 'EXPENSE',
      description: 'lunch',
      date: new Date().toISOString(),
    });

    // Move the 200 baht expense from Food to Transport, bump it to 250.
    await txService.update(created.id, ctx.userId, { budgetId: transport.id, amount: 250 });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    const foodAfter = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    const transportAfter = await prisma.budget.findUniqueOrThrow({ where: { id: transport.id } });

    expect(Number(foodAfter.spentAmount)).toBe(0); // fully reversed
    expect(Number(transportAfter.spentAmount)).toBe(250); // new effect applied
    expect(Number(account.balance)).toBe(750); // 1000 - 250
    await assertSessionMirror(ctx.userId);
  });

  it('deleting a transaction fully reverses its effect', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 200,
      type: 'EXPENSE',
      description: 'lunch',
      date: new Date().toISOString(),
    });

    await txService.delete(created.id, ctx.userId);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    const budget = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(account.balance)).toBe(1000);
    expect(Number(budget.spentAmount)).toBe(0);
    await assertSessionMirror(ctx.userId);
  });
});

// See C:\Users\ammar\.claude\plans\linear-honking-hamming.md — mirrors what
// transaction.controller.ts's year/month -> startDate/endDate translation
// does; tested at the service level since this codebase has no HTTP-level
// test harness (consistent with every other test file here).
describe('TransactionService.getAll — startDate/endDate range filter (month switcher)', () => {
  let ctx: TestUserContext;
  const txService = new TransactionService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('only returns transactions within the given range, same shape transaction.controller.ts sends', async () => {
    const now = new Date();
    const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const past = current.month === 1
      ? { year: current.year - 1, month: 12 }
      : { year: current.year, month: current.month - 1 };

    await prisma.transaction.create({
      data: {
        userId: ctx.userId,
        accountId: ctx.accountId,
        type: 'INCOME',
        amount: 111,
        description: 'last month',
        date: bangkokMonthRangeUtc(past.year, past.month).start,
      },
    });
    await prisma.transaction.create({
      data: {
        userId: ctx.userId,
        accountId: ctx.accountId,
        type: 'INCOME',
        amount: 222,
        description: 'this month',
        date: bangkokMonthRangeUtc(current.year, current.month).start,
      },
    });

    const { start, end } = bangkokMonthRangeUtc(current.year, current.month);
    const { transactions } = await txService.getAll(ctx.userId, {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      page: 1,
      limit: 20,
    });

    expect(transactions).toHaveLength(1);
    expect(transactions[0].description).toBe('this month');
  });
});
