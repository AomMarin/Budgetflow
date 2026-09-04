import crypto from 'crypto';
import { prisma } from '../../../config/database';
import { hashPassword } from '../../../utils/password';
import { buildPaginationMeta } from '../../../utils/response';
import { HouseholdRepository, MembershipWithHousehold } from '../household.repository';
import { BudgetService } from '../../budgets/budget.service';
import { TransactionService } from '../../transactions/transaction.service';
import { TransactionFilters } from '../../transactions/transaction.dto';
import { CreateBudgetDto, UpdateBudgetDto } from '../../budgets/budget.dto';
import { PoolRepository } from './pool.repository';
import { ContributeDto, SpendDto, UpdatePoolTransactionDto } from './pool.dto';
import { assertBudgetsPeriodOpen } from '../../../utils/period-guard';

export class PoolService {
  constructor(
    private readonly householdRepo = new HouseholdRepository(),
    private readonly poolRepo = new PoolRepository(),
    private readonly budgetService = new BudgetService(),
    private readonly transactionService = new TransactionService(),
  ) {}

  private notFound(message: string): never {
    throw Object.assign(new Error(message), { status: 404 });
  }

  private forbidden(message: string): never {
    throw Object.assign(new Error(message), { status: 403 });
  }

  private badRequest(message: string): never {
    throw Object.assign(new Error(message), { status: 400 });
  }

  private async requireMembership(userId: string): Promise<MembershipWithHousehold> {
    const membership = await this.householdRepo.findMembershipByUserId(userId);
    if (!membership) this.forbidden('Not a member of any household');
    return membership;
  }

  private async requirePool(userId: string): Promise<{ membership: MembershipWithHousehold; poolUserId: string }> {
    const membership = await this.requireMembership(userId);
    if (!membership.household.poolUserId) {
      this.badRequest('Shared pool is not enabled for this household — ask the owner to enable it');
    }
    return { membership, poolUserId: membership.household.poolUserId };
  }

  async enable(userId: string): Promise<{ poolUserId: string; alreadyEnabled: boolean }> {
    const membership = await this.requireMembership(userId);
    if (membership.role !== 'OWNER') {
      this.forbidden('Only the household owner can enable the shared pool');
    }

    return prisma.$transaction(async (tx) => {
      const household = await tx.household.findUniqueOrThrow({ where: { id: membership.householdId } });
      if (household.poolUserId) return { poolUserId: household.poolUserId, alreadyEnabled: true };

      const poolUser = await tx.user.create({
        data: {
          email: `pool-${household.id}@system.budgetflow.local`,
          password: await hashPassword(crypto.randomBytes(32).toString('hex')),
          name: `งบกลาง: ${household.name}`,
          isPoolAccount: true,
        },
      });
      await tx.account.create({
        data: { userId: poolUser.id, name: 'บัญชีกลาง', balance: 0, isDefault: true },
      });
      await tx.household.update({ where: { id: household.id }, data: { poolUserId: poolUser.id } });

      return { poolUserId: poolUser.id, alreadyEnabled: false };
    });
  }

  async getSummary(userId: string) {
    const { poolUserId } = await this.requirePool(userId);
    const [account, budgets] = await Promise.all([
      this.poolRepo.getPoolAccount(poolUserId),
      this.budgetService.getAll(poolUserId),
    ]);
    return {
      accountId: account?.id ?? null,
      balance: account ? Number(account.balance) : 0,
      budgets,
    };
  }

  async getBudgets(userId: string) {
    const { poolUserId } = await this.requirePool(userId);
    return this.budgetService.getAll(poolUserId);
  }

  async createBudget(userId: string, dto: CreateBudgetDto) {
    const { poolUserId } = await this.requirePool(userId);
    return this.budgetService.create(poolUserId, dto);
  }

  async updateBudget(userId: string, budgetId: string, dto: UpdateBudgetDto) {
    const { poolUserId } = await this.requirePool(userId);
    return this.budgetService.update(budgetId, poolUserId, dto);
  }

  async deleteBudget(userId: string, budgetId: string): Promise<void> {
    const { poolUserId } = await this.requirePool(userId);
    await this.budgetService.delete(budgetId, poolUserId);
  }

  async getTransactions(userId: string, filters: TransactionFilters) {
    const { poolUserId } = await this.requirePool(userId);
    const { transactions, total } = await this.poolRepo.findTransactions(poolUserId, filters);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    return { transactions, meta: buildPaginationMeta(total, page, limit) };
  }

  async spend(actorUserId: string, dto: SpendDto) {
    const { poolUserId } = await this.requirePool(actorUserId);
    const account = await this.poolRepo.getPoolAccount(poolUserId);
    if (!account) this.notFound('Pool account not found');

    return this.transactionService.create(
      poolUserId,
      {
        accountId: account.id,
        budgetId: dto.budgetId,
        amount: dto.amount,
        type: 'EXPENSE',
        description: dto.description,
        date: dto.date,
      },
      actorUserId,
    );
  }

  async updateTransaction(actorUserId: string, txId: string, dto: UpdatePoolTransactionDto) {
    const { poolUserId } = await this.requirePool(actorUserId);
    return this.transactionService.update(txId, poolUserId, dto);
  }

  async deleteTransaction(actorUserId: string, txId: string): Promise<void> {
    const { poolUserId } = await this.requirePool(actorUserId);
    await this.transactionService.delete(txId, poolUserId);
  }

  async contribute(actorUserId: string, dto: ContributeDto) {
    // Defense in depth alongside contributeValidation — see ContributeDto
    // comment: an unbudgeted contribution decremented balance with no budget
    // ever picking up the slack, silently breaking the zero-based invariant.
    if (!dto.fromBudgetId) this.badRequest('กรุณาเลือกงบสำหรับเงินสมทบ');

    const { membership, poolUserId } = await this.requirePool(actorUserId);

    const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
    if (!actor) this.notFound('User not found');

    const fromAccount = await prisma.account.findFirst({
      where: { id: dto.fromAccountId, userId: actorUserId },
    });
    if (!fromAccount) this.notFound('Account not found');

    const poolAccount = await this.poolRepo.getPoolAccount(poolUserId);
    if (!poolAccount) this.notFound('Pool account not found');

    const description = dto.description || `สมทบงบกลาง: ${membership.household.name}`;
    const poolDescription = `เงินสมทบจาก ${actor.name}`;

    return prisma.$transaction(async (tx) => {
      // Row-locked read: prevents two concurrent contributions from the same
      // budget both passing the check against the same stale spentAmount.
      const [budget] = await tx.$queryRaw<
        Array<{ id: string; name: string; allocatedAmount: string; spentAmount: string }>
      >`SELECT id, name, "allocatedAmount", "spentAmount" FROM budgets
         WHERE id = ${dto.fromBudgetId} AND "userId" = ${actorUserId} FOR UPDATE`;
      if (!budget) this.notFound('Budget not found');

      const remaining = Number(budget.allocatedAmount) - Number(budget.spentAmount);
      if (dto.amount > remaining) {
        this.badRequest(
          `งบ "${budget.name}" ไม่พอ — เหลือ ${remaining.toFixed(2)} บาท ขาด ${(dto.amount - remaining).toFixed(2)} บาท`,
        );
      }

      const memberTx = await tx.transaction.create({
        data: {
          userId: actorUserId,
          accountId: dto.fromAccountId,
          budgetId: dto.fromBudgetId,
          amount: dto.amount,
          type: 'EXPENSE',
          description,
          date: new Date(),
        },
      });
      await tx.account.update({
        where: { id: dto.fromAccountId },
        data: { balance: { decrement: dto.amount } },
      });
      await tx.budget.update({
        where: { id: dto.fromBudgetId },
        data: { spentAmount: { increment: dto.amount } },
      });

      const poolTx = await tx.transaction.create({
        data: {
          userId: poolUserId,
          accountId: poolAccount.id,
          actorUserId,
          linkedTransactionId: memberTx.id,
          amount: dto.amount,
          type: 'INCOME',
          description: poolDescription,
          date: new Date(),
        },
      });
      await tx.account.update({
        where: { id: poolAccount.id },
        data: { balance: { increment: dto.amount } },
      });

      await tx.transaction.update({
        where: { id: memberTx.id },
        data: { linkedTransactionId: poolTx.id },
      });

      return { memberTransactionId: memberTx.id, poolTransactionId: poolTx.id };
    });
  }

  async reverseContribution(userId: string, txId: string): Promise<void> {
    const { poolUserId } = await this.requirePool(userId);

    const poolTx = await prisma.transaction.findFirst({ where: { id: txId, userId: poolUserId } });
    if (!poolTx) this.notFound('Transaction not found');
    if (!poolTx.linkedTransactionId) this.badRequest('This transaction is not a reversible contribution');

    const memberTx = await prisma.transaction.findUnique({ where: { id: poolTx.linkedTransactionId } });
    if (!memberTx) this.notFound('Linked transaction not found');

    const poolAccount = await prisma.account.findUnique({ where: { id: poolTx.accountId } });
    if (!poolAccount) this.notFound('Pool account not found');
    if (Number(poolAccount.balance) < Number(poolTx.amount)) {
      this.badRequest(
        `ยอดคงเหลือในงบกลางไม่พอสำหรับยกเลิกการสมทบนี้ — เหลือ ${Number(poolAccount.balance).toFixed(2)} บาท ต้องใช้ ${Number(poolTx.amount).toFixed(2)} บาท`,
      );
    }

    await prisma.$transaction(async (tx) => {
      // contribute() bypasses TransactionService and decrements spentAmount
      // directly (see below), same as delete() there — so it needs the same
      // closed-period guard: reversing a contribution whose month has since
      // been closed would corrupt that month's frozen BudgetMonthlyHistory.
      if (memberTx.budgetId) {
        await assertBudgetsPeriodOpen(tx, [memberTx.budgetId], memberTx.date);
      }

      await tx.account.update({
        where: { id: poolTx.accountId },
        data: { balance: { decrement: Number(poolTx.amount) } },
      });

      await tx.account.update({
        where: { id: memberTx.accountId },
        data: { balance: { increment: Number(memberTx.amount) } },
      });
      if (memberTx.budgetId) {
        await tx.budget.update({
          where: { id: memberTx.budgetId },
          data: { spentAmount: { decrement: Number(memberTx.amount) } },
        });
      }

      await tx.transaction.delete({ where: { id: poolTx.id } });
      await tx.transaction.delete({ where: { id: memberTx.id } });
    });
  }
}
