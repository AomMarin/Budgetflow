import { prisma } from '../config/database';
import { RecurringService } from '../features/recurring/recurring.service';
import { BudgetService } from '../features/budgets/budget.service';
import { NotificationService } from '../features/notifications/notification.service';
import { logger } from '../utils/logger';

export async function runDailyJob(): Promise<void> {
  const recurringService = new RecurringService();
  const budgetService = new BudgetService();
  const notificationService = new NotificationService();

  const users = await prisma.user.findMany({ select: { id: true } });

  for (const { id: userId } of users) {
    try {
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

      const triggered = await budgetService.checkAlerts(userId);
      for (const alert of triggered) {
        await notificationService.create({
          userId,
          type: 'BUDGET_ALERT',
          title: `งบ "${alert.name}" ใช้ไปแล้ว ${alert.usagePercent}%`,
          message:
            alert.level >= 100
              ? `งบ "${alert.name}" ใช้เกินที่จัดสรรไว้แล้ว กรุณาโยกงบจากกลุ่มอื่นก่อน`
              : `งบ "${alert.name}" ใกล้เต็มงบ (${alert.usagePercent}%) กรุณาตรวจสอบ`,
          link: '/budgets',
        });
      }
    } catch (err) {
      logger.error(`Daily job failed for user ${userId}: ${(err as Error).message}`);
    }
  }
}
