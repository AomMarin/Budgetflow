import { BudgetService } from '../features/budgets/budget.service';
import { NotificationService } from '../features/notifications/notification.service';

const budgetService = new BudgetService();
const notificationService = new NotificationService();

// Re-checks alert thresholds for a user and creates BUDGET_ALERT notifications
// for any budget whose level increased. Call after any flow that can push
// Budget.spentAmount up outside the interactive create/update flow (which
// blocks over-budget expenses directly instead) — e.g. recurring processing
// or CSV import, where blocking isn't appropriate but the user still needs
// to know a budget went over.
export async function notifyBudgetAlerts(userId: string): Promise<void> {
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
}
