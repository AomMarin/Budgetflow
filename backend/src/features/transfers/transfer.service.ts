import { prisma } from '../../config/database';
import { buildPaginationMeta } from '../../utils/response';
import { withRetry } from '../../utils/db-retry';

export interface CreateTransferDto {
  fromBudgetId: string;
  toBudgetId: string;
  amount: number;
  description?: string;
}

export class TransferService {
  // No closed-period guard here, unlike transaction.service.ts / pool.service.ts
  // reverseContribution(). Both conditions that make the guard necessary are
  // absent for transfers: (1) CreateTransferDto has no `date` — a transfer
  // always acts at "now", so it can never backdate into a closed month, and
  // (2) it only moves allocatedAmount between budgets, never spentAmount —
  // spentAmount is the field a closed month's BudgetMonthlyHistory freezes.
  // If either changes (a `date` field is added, or transfers start touching
  // spentAmount) this reasoning breaks and the guard needs to be added — see
  // assertBudgetsPeriodOpen in utils/period-guard.ts.
  async create(userId: string, dto: CreateTransferDto) {
    if (dto.fromBudgetId === dto.toBudgetId) {
      throw Object.assign(new Error('Cannot transfer to the same budget'), { status: 400 });
    }

    return withRetry(() => prisma.$transaction(async (tx) => {
      // Row-locked read: prevents two concurrent transfers from the same
      // budget both passing the check against the same stale spentAmount.
      const [fromBudget] = await tx.$queryRaw<
        Array<{ id: string; name: string; allocatedAmount: string; spentAmount: string }>
      >`SELECT id, name, "allocatedAmount", "spentAmount" FROM budgets
         WHERE id = ${dto.fromBudgetId} AND "userId" = ${userId} FOR UPDATE`;
      if (!fromBudget) throw Object.assign(new Error('Source budget not found'), { status: 404 });

      const toBudget = await tx.budget.findFirst({ where: { id: dto.toBudgetId, userId } });
      if (!toBudget) throw Object.assign(new Error('Destination budget not found'), { status: 404 });

      const fromRemaining = Number(fromBudget.allocatedAmount) - Number(fromBudget.spentAmount);
      if (fromRemaining < dto.amount) {
        throw Object.assign(
          new Error(`Insufficient funds in "${fromBudget.name}". Available: ${fromRemaining}`),
          { status: 400 },
        );
      }

      const transfer = await tx.transfer.create({
        data: {
          userId,
          fromBudgetId: dto.fromBudgetId,
          toBudgetId: dto.toBudgetId,
          amount: dto.amount,
          description: dto.description,
        },
        include: {
          fromBudget: { select: { id: true, name: true, icon: true, color: true } },
          toBudget: { select: { id: true, name: true, icon: true, color: true } },
        },
      });

      // Debit from source (decrease allocated — money moved, not spent)
      await tx.budget.update({
        where: { id: dto.fromBudgetId },
        data: { allocatedAmount: { decrement: dto.amount } },
      });

      // Credit to destination (increase allocated)
      await tx.budget.update({
        where: { id: dto.toBudgetId },
        data: { allocatedAmount: { increment: dto.amount } },
      });

      return transfer;
    }), 'transfer.create');
  }

  async getAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [transfers, total] = await prisma.$transaction([
      prisma.transfer.findMany({
        where: { userId },
        include: {
          fromBudget: { select: { id: true, name: true, icon: true, color: true } },
          toBudget: { select: { id: true, name: true, icon: true, color: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transfer.count({ where: { userId } }),
    ]);

    return { transfers, meta: buildPaginationMeta(total, page, limit) };
  }
}
