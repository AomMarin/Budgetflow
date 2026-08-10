import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { BudgetService } from '../budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';

describe('BudgetService — zero-based invariant', () => {
  let ctx: TestUserContext;
  const service = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('rejects allocating more than the account balance', async () => {
    await expect(
      service.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 1500 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('allows allocating exactly the account balance', async () => {
    const budget = await service.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 1000,
    });
    expect(Number(budget.allocatedAmount)).toBe(1000);
  });

  it('rejects a second budget that would push total allocation over balance', async () => {
    await service.create(ctx.userId, { name: 'Food', icon: '🍔', color: '#3B82F6', allocatedAmount: 600 });
    await expect(
      service.create(ctx.userId, { name: 'Transport', icon: '🚗', color: '#EF4444', allocatedAmount: 500 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('computes available allocation from totalRemaining, not totalAllocated, once money has been spent', async () => {
    // Regression for commit 43b1c58: spending doesn't shrink allocatedAmount,
    // it shrinks the account balance. A naive check against totalAllocated
    // would double-count the 400 already spent against the balance.
    const food = await service.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    await prisma.transaction.create({
      data: {
        userId: ctx.userId,
        accountId: ctx.accountId,
        budgetId: food.id,
        type: 'EXPENSE',
        amount: 400,
        description: 'lunch',
        date: new Date(),
      },
    });
    await prisma.account.update({ where: { id: ctx.accountId }, data: { balance: { decrement: 400 } } });
    await prisma.budget.update({ where: { id: food.id }, data: { spentAmount: { increment: 400 } } });

    // Balance is now 600 (1000 - 400), Food has allocated=500/spent=400 -> remaining=100.
    // Room for new allocation = balance(600) - totalRemaining(100) = 500.
    await expect(
      service.create(ctx.userId, { name: 'Transport', icon: '🚗', color: '#EF4444', allocatedAmount: 600 }),
    ).rejects.toMatchObject({ status: 400 });

    const transport = await service.create(ctx.userId, {
      name: 'Transport',
      icon: '🚗',
      color: '#EF4444',
      allocatedAmount: 500,
    });
    expect(Number(transport.allocatedAmount)).toBe(500);
  });
});

describe('BudgetService.update — new guards', () => {
  let ctx: TestUserContext;
  const service = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('blocks lowering allocatedAmount below spentAmount', async () => {
    const food = await service.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    await prisma.budget.update({ where: { id: food.id }, data: { spentAmount: 300 } });

    await expect(service.update(food.id, ctx.userId, { allocatedAmount: 200 })).rejects.toMatchObject({
      status: 400,
    });

    // Equal to spentAmount is fine (remaining = 0, not negative).
    const updated = await service.update(food.id, ctx.userId, { allocatedAmount: 300 });
    expect(Number(updated.allocatedAmount)).toBe(300);
  });

  it('blocks editing an archived budget', async () => {
    const food = await service.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    await prisma.budget.update({ where: { id: food.id }, data: { isArchived: true } });

    await expect(service.update(food.id, ctx.userId, { allocatedAmount: 100 })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('an overspent-then-lowered budget (pre-existing bad data) cannot inflate headroom for other budgets', async () => {
    // Simulates data that predates the update() guard, to prove the
    // repository-level flooring in getAllocationTotals holds as a safety net.
    const food = await service.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    await prisma.budget.update({
      where: { id: food.id },
      data: { allocatedAmount: 100, spentAmount: 400 },
    });
    await prisma.account.update({ where: { id: ctx.accountId }, data: { balance: { decrement: 400 } } });

    // Real cash left: balance(1000) - spent(400) = 600. Food's floored
    // remaining is max(100-400, 0) = 0, so up to 600 should still be
    // allocatable to a new budget — not 1000 - (100-400) = 1300.
    await expect(
      service.create(ctx.userId, { name: 'Transport', icon: '🚗', color: '#EF4444', allocatedAmount: 700 }),
    ).rejects.toMatchObject({ status: 400 });

    const transport = await service.create(ctx.userId, {
      name: 'Transport',
      icon: '🚗',
      color: '#EF4444',
      allocatedAmount: 600,
    });
    expect(Number(transport.allocatedAmount)).toBe(600);
  });
});
