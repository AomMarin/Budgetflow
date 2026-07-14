import { Budget, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateBudgetDto, UpdateBudgetDto } from './budget.dto';

export class BudgetRepository {
  async findAll(userId: string): Promise<Budget[]> {
    return prisma.budget.findMany({
      where: { userId, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string, userId: string): Promise<Budget | null> {
    return prisma.budget.findFirst({ where: { id, userId } });
  }

  async create(userId: string, data: CreateBudgetDto): Promise<Budget> {
    const count = await prisma.budget.count({ where: { userId } });
    return prisma.budget.create({
      data: { ...data, userId, sortOrder: count },
    });
  }

  async update(id: string, userId: string, data: UpdateBudgetDto): Promise<Budget> {
    return prisma.budget.update({ where: { id, userId }, data });
  }

  async archive(id: string, userId: string): Promise<Budget> {
    return prisma.budget.update({
      where: { id, userId },
      data: { isArchived: true },
    });
  }

  async delete(id: string, userId: string): Promise<Budget> {
    return prisma.budget.delete({ where: { id, userId } });
  }

  async updateAmounts(
    id: string,
    userId: string,
    data: { allocatedAmount?: Prisma.Decimal | number; spentAmount?: Prisma.Decimal | number },
  ): Promise<Budget> {
    return prisma.budget.update({ where: { id, userId }, data });
  }

  async incrementSpent(id: string, amount: number): Promise<Budget> {
    return prisma.budget.update({
      where: { id },
      data: { spentAmount: { increment: amount } },
    });
  }

  async decrementSpent(id: string, amount: number): Promise<Budget> {
    return prisma.budget.update({
      where: { id },
      data: { spentAmount: { decrement: amount } },
    });
  }

  async updateAlertLevel(id: string, level: number | null): Promise<void> {
    await prisma.budget.update({ where: { id }, data: { lastAlertedLevel: level } });
  }

  async getTotalAllocated(userId: string): Promise<number> {
    const result = await prisma.budget.aggregate({
      where: { userId, isArchived: false },
      _sum: { allocatedAmount: true },
    });
    return Number(result._sum.allocatedAmount ?? 0);
  }
}
