import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { RolloverPolicy } from '@prisma/client';
import { DashboardService } from '../dashboard.service';
import { BudgetService } from '../../budgets/budget.service';
import { prisma } from '../../../config/database';
import { createTestUser, cleanupTestUser, TestUserContext } from '../../../test/helpers';
import { getBangkokYearMonth } from '../../../utils/period';

// See budget.period-close.test.ts's "lazy period-close hook wiring" describe
// block for why this asserts end-to-end behavior instead of spying on
// closeAndAdvancePeriodsForUser.
describe('DashboardService.getSummary lazy period-close hook', () => {
  let ctx: TestUserContext;
  const dashboardService = new DashboardService();
  const budgetService = new BudgetService();

  beforeEach(async () => {
    ctx = await createTestUser(1000);
  });

  afterEach(async () => {
    await cleanupTestUser(ctx.userId);
  });

  it('advances a stale budget period before computing the summary', async () => {
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

    const summary = await dashboardService.getSummary(ctx.userId);

    const { year, month } = getBangkokYearMonth();
    const after = summary.budgets.find((b) => b.id === budget.id);
    expect(after?.periodYear).toBe(year);
    expect(after?.periodMonth).toBe(month);
    expect(Number(after?.spentAmount)).toBe(0);
  });
});
