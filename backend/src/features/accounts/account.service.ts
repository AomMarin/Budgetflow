import { prisma } from '../../config/database';
import { BudgetRepository } from '../budgets/budget.repository';

const budgetRepo = new BudgetRepository();

export class AccountService {
  async setupBalance(userId: string, newBalance: number) {
    return prisma.$transaction(async (tx) => {
      // Per-user advisory lock used by BudgetService create/update: FOR UPDATE
      // on existing rows can't guard an aggregate check against a concurrent
      // budget create (phantom row, invisible until commit).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;

      const account = await tx.account.findFirst({ where: { userId, isDefault: true } });
      if (!account) throw Object.assign(new Error('Default account not found'), { status: 404 });

      const [{ totalRemaining }, balanceAgg] = await Promise.all([
        budgetRepo.getAllocationTotals(userId, tx),
        tx.account.aggregate({ where: { userId }, _sum: { balance: true } }),
      ]);
      const currentTotalBalance = Number(balanceAgg._sum.balance ?? 0);
      const newTotalBalance = currentTotalBalance - Number(account.balance) + newBalance;
      // Compare against totalRemaining (unspent earmarks), not totalAllocated —
      // spent money already left the balance via its expense transaction, so
      // totalAllocated alone double-counts it. Same fix as BudgetService.
      if (newTotalBalance < totalRemaining) {
        throw Object.assign(
          new Error(
            `ยอดเงินใหม่ทำให้ยอดรวมในบัญชีน้อยกว่ายอดที่ยังจัดสรรค้างอยู่ (คงเหลือที่จัดสรรไว้ ${totalRemaining.toFixed(2)} บาท) กรุณาลดยอดจัดสรรงบก่อน`,
          ),
          { status: 400 },
        );
      }

      return tx.account.update({ where: { id: account.id }, data: { balance: newBalance } });
    });
  }
}
