import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TransactionService } from '../transaction.service';
import { BudgetService } from '../../budgets/budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';

// Closes the mindmint@budgetflow.app incident: an EXPENSE with no budgetId
// decremented Account.balance without any budget's spentAmount moving to
// match, letting Sigma(remaining) silently exceed Sigma(balance) with
// nothing catching it. EXPENSE now always requires a budgetId; INCOME is
// exempt (see CLAUDE.md — it never affects a budget by design).
describe('TransactionService — EXPENSE requires a budgetId', () => {
  let ctx: TestUserContext;
  const txService = new TransactionService();
  const budgetService = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('create() rejects an EXPENSE with no budgetId', async () => {
    await expect(
      txService.create(ctx.userId, {
        accountId: ctx.accountId,
        amount: 100,
        type: 'EXPENSE',
        description: 'unbudgeted',
        date: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ status: 400 });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    expect(Number(account.balance)).toBe(1000); // untouched — no partial write
  });

  it('create() still accepts an INCOME with no budgetId', async () => {
    await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      amount: 100,
      type: 'INCOME',
      description: 'gift',
      date: new Date().toISOString(),
    });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    expect(Number(account.balance)).toBe(1100);
  });

  it('update() rejects clearing budgetId on an EXPENSE', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    const tx = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      budgetId: food.id,
      amount: 100,
      type: 'EXPENSE',
      description: 'lunch',
      date: new Date().toISOString(),
    });

    await expect(txService.update(tx.id, ctx.userId, { budgetId: null })).rejects.toMatchObject({ status: 400 });
  });

  it('update() rejects switching an INCOME to EXPENSE without also providing a budgetId', async () => {
    const tx = await txService.create(ctx.userId, {
      accountId: ctx.accountId,
      amount: 100,
      type: 'INCOME',
      description: 'gift',
      date: new Date().toISOString(),
    });

    await expect(txService.update(tx.id, ctx.userId, { type: 'EXPENSE' })).rejects.toMatchObject({ status: 400 });
  });

  it('batchCreate() rejects a batch containing an unbudgeted EXPENSE, writing nothing', async () => {
    await expect(
      txService.batchCreate(ctx.userId, [
        {
          accountId: ctx.accountId,
          amount: 50,
          type: 'INCOME',
          description: 'ok row',
          date: new Date().toISOString(),
        },
        {
          accountId: ctx.accountId,
          amount: 50,
          type: 'EXPENSE',
          description: 'unbudgeted row',
          date: new Date().toISOString(),
        },
      ]),
    ).rejects.toMatchObject({ status: 400 });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    expect(Number(account.balance)).toBe(1000); // neither row applied
  });
});
