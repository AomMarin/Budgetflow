import { TransactionRepository } from './transaction.repository';
import { CreateTransactionDto, UpdateTransactionDto, TransactionFilters } from './transaction.dto';
import { BudgetRepository } from '../budgets/budget.repository';
import { prisma } from '../../config/database';
import { buildPaginationMeta } from '../../utils/response';

export class TransactionService {
  constructor(
    private readonly repo = new TransactionRepository(),
    private readonly budgetRepo = new BudgetRepository(),
  ) {}

  async getAll(userId: string, filters: TransactionFilters) {
    const { transactions, total } = await this.repo.findAll(userId, filters);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    return { transactions, meta: buildPaginationMeta(total, page, limit) };
  }

  async getById(id: string, userId: string) {
    const tx = await this.repo.findById(id, userId);
    if (!tx) throw Object.assign(new Error('Transaction not found'), { status: 404 });
    return tx;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    const account = await prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

    if (dto.budgetId) {
      const budget = await this.budgetRepo.findById(dto.budgetId, userId);
      if (!budget) throw Object.assign(new Error('Budget not found'), { status: 404 });

      if (dto.type === 'EXPENSE') {
        const remaining = Number(budget.allocatedAmount) - Number(budget.spentAmount);
        if (dto.amount > remaining) {
          throw Object.assign(
            new Error(
              `งบ "${budget.name}" ไม่พอ — เหลือ ${remaining.toFixed(2)} บาท ขาด ${(dto.amount - remaining).toFixed(2)} บาท กรุณาโยกงบจากกลุ่มอื่นก่อน`,
            ),
            { status: 400, code: 'BUDGET_INSUFFICIENT' },
          );
        }
      }
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await this.repo.create({
        userId,
        accountId: dto.accountId,
        budgetId: dto.budgetId ?? null,
        amount: dto.amount,
        type: dto.type,
        description: dto.description,
        date: new Date(dto.date),
      });

      if (dto.type === 'INCOME') {
        await tx.account.update({
          where: { id: dto.accountId },
          data: { balance: { increment: dto.amount } },
        });
      } else {
        await tx.account.update({
          where: { id: dto.accountId },
          data: { balance: { decrement: dto.amount } },
        });
        if (dto.budgetId) {
          await tx.budget.update({
            where: { id: dto.budgetId },
            data: { spentAmount: { increment: dto.amount } },
          });
        }
      }

      return created;
    });

    return transaction;
  }

  async update(id: string, userId: string, dto: UpdateTransactionDto) {
    const existing = await this.getById(id, userId);

    const newType = dto.type ?? existing.type;
    const newBudgetId = dto.budgetId !== undefined ? dto.budgetId : existing.budgetId;
    const newAmount = dto.amount ?? Number(existing.amount);

    if (newType === 'EXPENSE' && newBudgetId) {
      const budget = await this.budgetRepo.findById(newBudgetId, userId);
      if (!budget) throw Object.assign(new Error('Budget not found'), { status: 404 });

      const currentRemaining = Number(budget.allocatedAmount) - Number(budget.spentAmount);
      // If the same budget, the old amount will be freed up after reversal
      const oldContribution = (existing.type === 'EXPENSE' && existing.budgetId === newBudgetId)
        ? Number(existing.amount)
        : 0;
      const effectiveRemaining = currentRemaining + oldContribution;

      if (newAmount > effectiveRemaining) {
        throw Object.assign(
          new Error(
            `งบ "${budget.name}" ไม่พอ — เหลือ ${effectiveRemaining.toFixed(2)} บาท ขาด ${(newAmount - effectiveRemaining).toFixed(2)} บาท กรุณาโยกงบจากกลุ่มอื่นก่อน`,
          ),
          { status: 400, code: 'BUDGET_INSUFFICIENT' },
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      // Reverse old effects
      if (existing.type === 'INCOME') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: Number(existing.amount) } },
        });
      } else {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: Number(existing.amount) } },
        });
        if (existing.budgetId) {
          await tx.budget.update({
            where: { id: existing.budgetId },
            data: { spentAmount: { decrement: Number(existing.amount) } },
          });
        }
      }

      // Apply new effects
      if (newType === 'INCOME') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: newAmount } },
        });
      } else {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: newAmount } },
        });
        if (newBudgetId) {
          await tx.budget.update({
            where: { id: newBudgetId },
            data: { spentAmount: { increment: newAmount } },
          });
        }
      }

      return this.repo.update(id, userId, {
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.budgetId !== undefined && { budgetId: dto.budgetId }),
      });
    });
  }

  async batchCreate(userId: string, items: CreateTransactionDto[]): Promise<number> {
    if (items.length === 0) return 0;

    const accountIds = [...new Set(items.map((i) => i.accountId))];
    for (const accountId of accountIds) {
      const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
      if (!account) throw Object.assign(new Error(`Account ${accountId} not found`), { status: 404 });
    }
    const budgetIds = [...new Set(items.map((i) => i.budgetId).filter(Boolean) as string[])];
    for (const budgetId of budgetIds) {
      const budget = await this.budgetRepo.findById(budgetId, userId);
      if (!budget) throw Object.assign(new Error(`Budget ${budgetId} not found`), { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      for (const dto of items) {
        await tx.transaction.create({
          data: {
            userId,
            accountId: dto.accountId,
            budgetId: dto.budgetId ?? null,
            amount: dto.amount,
            type: dto.type,
            description: dto.description,
            date: new Date(dto.date),
          },
        });

        if (dto.type === 'INCOME') {
          await tx.account.update({
            where: { id: dto.accountId },
            data: { balance: { increment: dto.amount } },
          });
        } else {
          await tx.account.update({
            where: { id: dto.accountId },
            data: { balance: { decrement: dto.amount } },
          });
          if (dto.budgetId) {
            await tx.budget.update({
              where: { id: dto.budgetId },
              data: { spentAmount: { increment: dto.amount } },
            });
          }
        }
      }
    });

    return items.length;
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.getById(id, userId);

    await prisma.$transaction(async (tx) => {
      if (existing.type === 'INCOME') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: Number(existing.amount) } },
        });
      } else {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: Number(existing.amount) } },
        });
        if (existing.budgetId) {
          await tx.budget.update({
            where: { id: existing.budgetId },
            data: { spentAmount: { decrement: Number(existing.amount) } },
          });
        }
      }

      await this.repo.delete(id, userId);
    });
  }
}
