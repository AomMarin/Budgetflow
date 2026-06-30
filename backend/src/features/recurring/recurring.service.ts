import { prisma } from '../../config/database';
import { RecurringRepository } from './recurring.repository';
import { CreateRecurringDto, UpdateRecurringDto } from './recurring.dto';

export class RecurringService {
  constructor(private readonly repo = new RecurringRepository()) {}

  async getAll(userId: string) {
    return this.repo.findAll(userId);
  }

  async getById(id: string, userId: string) {
    const item = await this.repo.findById(id, userId);
    if (!item) throw Object.assign(new Error('Recurring transaction not found'), { status: 404 });
    return item;
  }

  async create(userId: string, dto: CreateRecurringDto) {
    const account = await prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

    if (dto.budgetId) {
      const budget = await prisma.budget.findFirst({ where: { id: dto.budgetId, userId } });
      if (!budget) throw Object.assign(new Error('Budget not found'), { status: 404 });
    }

    return this.repo.create(userId, {
      userId,
      accountId: dto.accountId,
      budgetId: dto.budgetId ?? null,
      name: dto.name,
      type: dto.type,
      amount: dto.amount,
      dayOfMonth: dto.dayOfMonth,
      description: dto.description ?? null,
    });
  }

  async update(id: string, userId: string, dto: UpdateRecurringDto) {
    await this.getById(id, userId);
    return this.repo.update(id, userId, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.amount !== undefined && { amount: dto.amount }),
      ...(dto.dayOfMonth !== undefined && { dayOfMonth: dto.dayOfMonth }),
      ...(dto.accountId !== undefined && { accountId: dto.accountId }),
      ...(dto.budgetId !== undefined && { budgetId: dto.budgetId }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.getById(id, userId);
    await this.repo.delete(id, userId);
  }

  async process(userId: string): Promise<{ processed: number; names: string[] }> {
    const today = new Date();
    const due = await this.repo.findDue(userId, today);

    const names: string[] = [];

    for (const recurring of due) {
      await prisma.$transaction(async (tx) => {
        // Use the configured dayOfMonth but cap at actual days in month
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const txDay = Math.min(recurring.dayOfMonth, daysInMonth);
        const txDate = new Date(today.getFullYear(), today.getMonth(), txDay);

        await tx.transaction.create({
          data: {
            userId,
            accountId: recurring.accountId,
            budgetId: recurring.budgetId,
            type: recurring.type,
            amount: recurring.amount,
            description: recurring.description || recurring.name,
            date: txDate,
          },
        });

        if (recurring.type === 'INCOME') {
          await tx.account.update({
            where: { id: recurring.accountId },
            data: { balance: { increment: Number(recurring.amount) } },
          });
        } else {
          await tx.account.update({
            where: { id: recurring.accountId },
            data: { balance: { decrement: Number(recurring.amount) } },
          });
          if (recurring.budgetId) {
            await tx.budget.update({
              where: { id: recurring.budgetId },
              data: { spentAmount: { increment: Number(recurring.amount) } },
            });
          }
        }

        await tx.recurringTransaction.update({
          where: { id: recurring.id },
          data: { lastRunAt: today },
        });
      });

      names.push(recurring.name);
    }

    return { processed: names.length, names };
  }
}
