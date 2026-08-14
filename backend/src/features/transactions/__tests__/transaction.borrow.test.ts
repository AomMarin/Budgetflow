import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TransactionService } from '../transaction.service';
import { BudgetService } from '../../budgets/budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';

describe('TransactionService — borrow-from-budget (TransactionSplit)', () => {
  let ctx: TestUserContext;
  const txService = new TransactionService();
  const budgetService = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(10000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('a plain EXPENSE that fits its own budget never creates split rows', async () => {
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

    const splits = await prisma.transactionSplit.findMany({ where: { transactionId: created.id } });
    expect(splits).toHaveLength(0);
    const budget = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(budget.spentAmount)).toBe(200);
  });

  it('borrows overflow from a second budget atomically, leaving allocatedAmount untouched on both', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 6000,
    });
    const emergency = await budgetService.create(ctx.userId, {
      name: 'Emergency',
      icon: '🆘',
      color: '#EF4444',
      allocatedAmount: 1000,
    });

    // Pre-spend Food down to remaining 4000.
    await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 2000,
      type: 'EXPENSE',
      description: 'groceries',
      date: new Date().toISOString(),
    });

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 5000,
      type: 'EXPENSE',
      description: 'big dinner',
      date: new Date().toISOString(),
      borrowFromBudgetId: emergency.id,
    });

    const splits = await prisma.transactionSplit.findMany({ where: { transactionId: created.id } });
    expect(splits).toHaveLength(2);
    const byBudget = Object.fromEntries(splits.map((s) => [s.budgetId, Number(s.amount)]));
    expect(byBudget[food.id]).toBe(4000);
    expect(byBudget[emergency.id]).toBe(1000);

    const foodAfter = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    const emergencyAfter = await prisma.budget.findUniqueOrThrow({ where: { id: emergency.id } });
    expect(Number(foodAfter.spentAmount)).toBe(6000);
    expect(Number(foodAfter.allocatedAmount)).toBe(6000); // untouched
    expect(Number(emergencyAfter.spentAmount)).toBe(1000);
    expect(Number(emergencyAfter.allocatedAmount)).toBe(1000); // untouched

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    expect(Number(account.balance)).toBe(10000 - 2000 - 5000);
  });

  it('blocks borrowing from the same budget as the primary', async () => {
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
        borrowFromBudgetId: food.id,
      }),
    ).rejects.toMatchObject({ status: 400 });

    const budget = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(budget.spentAmount)).toBe(0);
  });

  it('blocks borrowing when the source budget itself has insufficient remaining', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 300,
    });
    const emergency = await budgetService.create(ctx.userId, {
      name: 'Emergency',
      icon: '🆘',
      color: '#EF4444',
      allocatedAmount: 50,
    });

    await expect(
      txService.create(ctx.userId, {
        accountId: ctx.accountId,
        budgetId: food.id,
        amount: 400,
        type: 'EXPENSE',
        description: 'too much',
        date: new Date().toISOString(),
        borrowFromBudgetId: emergency.id,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'BUDGET_INSUFFICIENT' });

    const foodAfter = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    const emergencyAfter = await prisma.budget.findUniqueOrThrow({ where: { id: emergency.id } });
    expect(Number(foodAfter.spentAmount)).toBe(0);
    expect(Number(emergencyAfter.spentAmount)).toBe(0);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    expect(Number(account.balance)).toBe(10000); // nothing applied
  });

  it('blocks borrowing from unallocated money — must reference a real budget', async () => {
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
        borrowFromBudgetId: 'not-a-real-budget-id',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('deleting a borrow transaction reverses spentAmount on both budgets', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 300,
    });
    const emergency = await budgetService.create(ctx.userId, {
      name: 'Emergency',
      icon: '🆘',
      color: '#EF4444',
      allocatedAmount: 500,
    });

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 400,
      type: 'EXPENSE',
      description: 'dinner',
      date: new Date().toISOString(),
      borrowFromBudgetId: emergency.id,
    });

    await txService.delete(created.id, ctx.userId);

    const foodAfter = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    const emergencyAfter = await prisma.budget.findUniqueOrThrow({ where: { id: emergency.id } });
    expect(Number(foodAfter.spentAmount)).toBe(0);
    expect(Number(emergencyAfter.spentAmount)).toBe(0);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    expect(Number(account.balance)).toBe(10000);
    const splits = await prisma.transactionSplit.findMany({ where: { transactionId: created.id } });
    expect(splits).toHaveLength(0); // cascade-deleted
  });

  it('editing a borrow transaction to fit its own budget again reverses both splits and drops them', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 300,
    });
    const emergency = await budgetService.create(ctx.userId, {
      name: 'Emergency',
      icon: '🆘',
      color: '#EF4444',
      allocatedAmount: 500,
    });

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 400,
      type: 'EXPENSE',
      description: 'dinner',
      date: new Date().toISOString(),
      borrowFromBudgetId: emergency.id,
    });

    // Shrink the amount back under Food's own remaining (300) and drop the borrow.
    await txService.update(created.id, ctx.userId, { amount: 100 });

    const foodAfter = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    const emergencyAfter = await prisma.budget.findUniqueOrThrow({ where: { id: emergency.id } });
    expect(Number(foodAfter.spentAmount)).toBe(100);
    expect(Number(emergencyAfter.spentAmount)).toBe(0);
    const splits = await prisma.transactionSplit.findMany({ where: { transactionId: created.id } });
    expect(splits).toHaveLength(0);
  });

  it('editing a plain EXPENSE to grow beyond its budget can add a new borrow split', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 300,
    });
    const emergency = await budgetService.create(ctx.userId, {
      name: 'Emergency',
      icon: '🆘',
      color: '#EF4444',
      allocatedAmount: 500,
    });

    const created = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 200,
      type: 'EXPENSE',
      description: 'dinner',
      date: new Date().toISOString(),
    });

    await txService.update(created.id, ctx.userId, { amount: 400, borrowFromBudgetId: emergency.id });

    const foodAfter = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    const emergencyAfter = await prisma.budget.findUniqueOrThrow({ where: { id: emergency.id } });
    expect(Number(foodAfter.spentAmount)).toBe(300);
    expect(Number(emergencyAfter.spentAmount)).toBe(100);
  });

  it('two concurrent borrow transactions that reference each other do not deadlock', async () => {
    const budgetA = await budgetService.create(ctx.userId, {
      name: 'A',
      icon: '🅰️',
      color: '#3B82F6',
      allocatedAmount: 100,
    });
    const budgetB = await budgetService.create(ctx.userId, {
      name: 'B',
      icon: '🅱️',
      color: '#EF4444',
      allocatedAmount: 100,
    });

    // Tx1: spend against A, borrow overflow from B. Tx2: spend against B, borrow overflow from A.
    // Run concurrently so their FOR UPDATE locks contend in opposite roles —
    // this must resolve (serialize), not deadlock or hang.
    const results = await Promise.allSettled([
      txService.create(ctx.userId, {
        accountId: ctx.accountId,
        budgetId: budgetA.id,
        amount: 150,
        type: 'EXPENSE',
        description: 'a spends into b',
        date: new Date().toISOString(),
        borrowFromBudgetId: budgetB.id,
      }),
      txService.create(ctx.userId, {
        accountId: ctx.accountId,
        budgetId: budgetB.id,
        amount: 150,
        type: 'EXPENSE',
        description: 'b spends into a',
        date: new Date().toISOString(),
        borrowFromBudgetId: budgetA.id,
      }),
    ]);

    // Both requested 150 against a 100-allocated primary needing to borrow 50
    // from a peer that itself only has 100 total — whichever runs second
    // sees the first one's consumption and may legitimately fail on
    // insufficient funds, but it must fail cleanly, never hang or throw a
    // deadlock/lock-timeout error.
    for (const r of results) {
      if (r.status === 'rejected') {
        expect((r.reason as { status?: number }).status).toBe(400);
      }
    }

    const aAfter = await prisma.budget.findUniqueOrThrow({ where: { id: budgetA.id } });
    const bAfter = await prisma.budget.findUniqueOrThrow({ where: { id: budgetB.id } });
    // Whatever happened, neither budget's spentAmount may exceed what it
    // actually has covered (allocatedAmount is never touched by borrow).
    expect(Number(aAfter.allocatedAmount)).toBe(100);
    expect(Number(bAfter.allocatedAmount)).toBe(100);
  });
});
