import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { HouseholdService } from '../../household.service';
import { PoolService } from '../pool.service';
import { BudgetService } from '../../../budgets/budget.service';
import { prisma } from '../../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../../test/helpers';

// Same fix as transaction.expense-budget-required.test.ts, applied to the
// household pool's separate write path: PoolService.contribute() used to
// let `fromBudgetId` be omitted, decrementing the actor's account balance
// with no budget ever picking up the slack.
describe('PoolService.contribute() requires a fromBudgetId', () => {
  let ctx: TestUserContext;
  const householdService = new HouseholdService();
  const poolService = new PoolService();
  const budgetService = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
    await householdService.create(ctx.userId, { name: 'Test Household' });
    await poolService.enable(ctx.userId);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('rejects a contribution with no fromBudgetId', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulating a caller that bypasses contributeValidation
      poolService.contribute(ctx.userId, { amount: 100, fromAccountId: ctx.accountId } as any),
    ).rejects.toMatchObject({ status: 400 });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    expect(Number(account.balance)).toBe(1000); // untouched
  });

  it('accepts a contribution with a valid fromBudgetId', async () => {
    const food = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });

    await poolService.contribute(ctx.userId, {
      amount: 100,
      fromAccountId: ctx.accountId,
      fromBudgetId: food.id,
    });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } });
    const budget = await prisma.budget.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(account.balance)).toBe(900);
    expect(Number(budget.spentAmount)).toBe(100);
  });
});
