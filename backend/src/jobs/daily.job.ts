import { prisma } from '../config/database';
import { RecurringService } from '../features/recurring/recurring.service';
import { NotificationService } from '../features/notifications/notification.service';
import { BudgetService } from '../features/budgets/budget.service';
import { notifyBudgetAlerts } from '../utils/budget-alerts';
import { logger } from '../utils/logger';

export async function runDailyJob(): Promise<void> {
  const recurringService = new RecurringService();
  const notificationService = new NotificationService();
  const budgetService = new BudgetService();

  const users = await prisma.user.findMany({ select: { id: true } });

  for (const { id: userId } of users) {
    try {
      // Close any month(s) a user's budgets have fallen behind on before
      // recurring transactions land or alerts are computed — otherwise
      // today's recurring EXPENSE hits a budget still stuck on last month's
      // period, and notifyBudgetAlerts reads stale spentAmount/allocated.
      await budgetService.closeAndAdvancePeriodsForUser(userId);

      const { processed, names } = await recurringService.process(userId);
      if (processed > 0) {
        await notificationService.create({
          userId,
          type: 'RECURRING_PROCESSED',
          title: `ทำรายการอัตโนมัติ ${processed} รายการ`,
          message: `รายการที่ประมวลผล: ${names.join(', ')}`,
          link: '/transactions',
        });
      }

      await notifyBudgetAlerts(userId);
    } catch (err) {
      logger.error(`Daily job failed for user ${userId}: ${(err as Error).message}`);
    }
  }
}
