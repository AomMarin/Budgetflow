import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TransactionService } from '../transaction.service';
import { BudgetService } from '../../budgets/budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';

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
  });
});
