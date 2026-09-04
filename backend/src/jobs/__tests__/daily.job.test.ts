import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { RolloverPolicy } from '@prisma/client';
import { runDailyJob } from '../daily.job';
import { BudgetService } from '../../features/budgets/budget.service';
import { prisma } from '../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../test/helpers';
import { getBangkokYearMonth } from '../../utils/period';

// See budget.period-close.test.ts's "lazy period-close hook wiring" describe
// block for why this asserts end-to-end behavior instead of spying on
// closeAndAdvancePeriodsForUser.
describe('runDailyJob period-close wiring', () => {
  let ctx: TestUserContext;
  const budgetService = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it("advances the user's stale budget periods before recurring/alerts run", async () => {
    const budget = await budgetService.create(ctx.userId, {
      name: 'Food',
      icon: '🍔',
      color: '#3B82F6',
      allocatedAmount: 500,
    });
    await prisma.budget.update({
      where: { id: budget.id },
      data: { periodYear: 2020, periodMonth: 1, rolloverPolicy: RolloverPolicy.SWEEP, spentAmount: 200 },
    });

    await runDailyJob();

    const after = await prisma.budget.findUniqueOrThrow({ where: { id: budget.id } });
    const { year, month } = getBangkokYearMonth();
    expect(after.periodYear).toBe(year);
    expect(after.periodMonth).toBe(month);
    expect(Number(after.spentAmount)).toBe(0);
  });
});
