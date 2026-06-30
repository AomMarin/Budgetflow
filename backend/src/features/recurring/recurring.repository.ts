import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

export class RecurringRepository {
  findAll(userId: string) {
    return prisma.recurringTransaction.findMany({
      where: { userId },
      include: {
        account: { select: { id: true, name: true } },
        budget: { select: { id: true, name: true, icon: true, color: true } },
      },
      orderBy: [{ dayOfMonth: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findById(id: string, userId: string) {
    return prisma.recurringTransaction.findFirst({
      where: { id, userId },
      include: {
        account: { select: { id: true, name: true } },
        budget: { select: { id: true, name: true, icon: true, color: true } },
      },
    });
  }

  findDue(userId: string, today: Date) {
    const dayOfMonth = today.getDate();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    return prisma.recurringTransaction.findMany({
      where: {
        userId,
        isActive: true,
        dayOfMonth: { lte: dayOfMonth },
        OR: [
          { lastRunAt: null },
          { lastRunAt: { lt: currentMonthStart } },
        ],
      },
      include: {
        account: true,
        budget: true,
      },
    });
  }

  create(userId: string, data: Prisma.RecurringTransactionUncheckedCreateInput) {
    return prisma.recurringTransaction.create({
      data: { ...data, userId },
      include: {
        account: { select: { id: true, name: true } },
        budget: { select: { id: true, name: true, icon: true, color: true } },
      },
    });
  }

  update(id: string, userId: string, data: Prisma.RecurringTransactionUpdateInput) {
    return prisma.recurringTransaction.update({
      where: { id, userId },
      data,
      include: {
        account: { select: { id: true, name: true } },
        budget: { select: { id: true, name: true, icon: true, color: true } },
      },
    });
  }

  delete(id: string, userId: string) {
    return prisma.recurringTransaction.delete({ where: { id, userId } });
  }
}
