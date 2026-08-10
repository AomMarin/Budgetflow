import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { BudgetService } from '../budget.service';
import { TransactionService } from '../../transactions/transaction.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';

describe('BudgetService.delete — delete vs archive', () => {
  let ctx: TestUserContext;
  const budgetService = new BudgetService();
  const txService = new TransactionService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('hard-deletes a budget with no transactions', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 300,
    });

    await budgetService.delete(food.id, ctx.userId);

    const found = await prisma.budget.findUnique({ where: { id: food.id } });
    expect(found).toBeNull();
  });

  it('archives (does not hard-delete) a budget that has transactions', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 300,
    });
    await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 100,
      type: 'EXPENSE',
      description: 'lunch',
      date: new Date().toISOString(),
    });

    await budgetService.delete(food.id, ctx.userId);

    const found = await prisma.budget.findUnique({ where: { id: food.id } });
    expect(found).not.toBeNull();
    expect(found?.isArchived).toBe(true);
  });

  it('excludes archived budgets from getAll but keeps them queryable by id', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 300,
    });
    await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 100,
      type: 'EXPENSE',
      description: 'lunch',
      date: new Date().toISOString(),
    });
    await budgetService.delete(food.id, ctx.userId);

    const all = await budgetService.getAll(ctx.userId);
    expect(all.find((b) => b.id === food.id)).toBeUndefined();

    const byId = await budgetService.getById(food.id, ctx.userId);
    expect(byId.id).toBe(food.id);
  });
});
