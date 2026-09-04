import { Prisma } from '@prisma/client';
import { TransactionRepository } from './transaction.repository';
import { CreateTransactionDto, UpdateTransactionDto, TransactionFilters } from './transaction.dto';
import { BudgetRepository } from '../budgets/budget.repository';
import { prisma } from '../../config/database';
import { buildPaginationMeta } from '../../utils/response';
import { getBangkokYearMonth, isBeforeYearMonth } from '../../utils/period';
import { assertBudgetsPeriodOpen, closedPeriodError } from '../../utils/period-guard';
import { withRetry } from '../../utils/db-retry';

type BudgetLockRow = { id: string; name: string; allocatedAmount: string; spentAmount: string };
type Split = { budgetId: string; amount: number };

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

  // Row-locked read: prevents a concurrent expense against the same budget
  // from both passing the check against the same stale spentAmount.
  private async lockBudgetRow(
    tx: Prisma.TransactionClient,
    userId: string,
    budgetId: string,
  ): Promise<BudgetLockRow> {
    const [row] = await tx.$queryRaw<BudgetLockRow[]>`
      SELECT id, name, "allocatedAmount", "spentAmount" FROM budgets
      WHERE id = ${budgetId} AND "userId" = ${userId} FOR UPDATE`;
    if (!row) throw Object.assign(new Error('Budget not found'), { status: 404 });
    return row;
  }

  // An EXPENSE with no budgetId decrements Account.balance without ever
  // touching any budget's spentAmount — nothing keeps Sigma(remaining) in
  // step with that balance drop, so Sigma(remaining) can silently exceed
  // Sigma(balance) with no check anywhere catching it (see the
  // mindmint@budgetflow.app incident this closes). INCOME is exempt: it
  // doesn't affect any budget by design (see CLAUDE.md), so it never needed
  // one.
  private assertBudgetIdRequiredForExpense(type: string, budgetId: string | null | undefined): void {
    if (type === 'EXPENSE' && !budgetId) {
      throw Object.assign(new Error('กรุณาเลือกงบสำหรับรายจ่าย'), { status: 400 });
    }
  }

  // Pure validation over already-locked rows — decides whether the expense
  // fits in the primary budget alone (returns [], the common case: caller
  // keeps the old single-budget spentAmount increment, no split rows) or
  // must borrow overflow from a second budget (returns exactly 2 splits
  // summing to `amount`). `reversedAmounts` lets update() offset a budget's
  // remaining by whatever this same transaction previously contributed to it
  // (generalizes the old single-budget "oldContribution" trick to N budgets).
  private computeExpenseSplits(
    primary: BudgetLockRow,
    amount: number,
    borrow: BudgetLockRow | null,
    reversedAmounts: Map<string, number>,
  ): Split[] {
    const primaryRemaining =
      Number(primary.allocatedAmount) - Number(primary.spentAmount) + (reversedAmounts.get(primary.id) ?? 0);

    if (amount <= primaryRemaining) return [];

    if (!borrow) {
      throw Object.assign(
        new Error(
          `งบ "${primary.name}" ไม่พอ — เหลือ ${primaryRemaining.toFixed(2)} บาท ขาด ${(amount - primaryRemaining).toFixed(2)} บาท กรุณาโยกงบจากกลุ่มอื่นก่อน หรือเลือกยืมจากงบอื่น`,
        ),
        { status: 400, code: 'BUDGET_INSUFFICIENT' },
      );
    }
    if (borrow.id === primary.id) {
      throw Object.assign(new Error('ไม่สามารถยืมจากงบเดียวกันได้'), { status: 400 });
    }

    const overflow = amount - primaryRemaining;
    const borrowRemaining =
      Number(borrow.allocatedAmount) - Number(borrow.spentAmount) + (reversedAmounts.get(borrow.id) ?? 0);

    if (overflow > borrowRemaining) {
      throw Object.assign(
        new Error(
          `งบ "${borrow.name}" ที่จะยืมก็มีไม่พอ — เหลือ ${borrowRemaining.toFixed(2)} บาท ขาด ${(overflow - borrowRemaining).toFixed(2)} บาท`,
        ),
        { status: 400, code: 'BUDGET_INSUFFICIENT' },
      );
    }

    return [
      { budgetId: primary.id, amount: Math.round(primaryRemaining * 100) / 100 },
      { budgetId: borrow.id, amount: Math.round(overflow * 100) / 100 },
    ];
  }

  // Locks the primary budget (and, if a borrow is requested, the borrow
  // budget too) and resolves the split. Always locks in ascending budgetId
  // order across BOTH ids whenever a borrow is requested — regardless of
  // which one ends up being "primary" in this call — so two concurrent
  // transactions borrowing from each other's budget can never deadlock
  // (classic AB/BA pattern otherwise).
  private async lockAndResolveExpenseSplits(
    tx: Prisma.TransactionClient,
    userId: string,
    budgetId: string,
    amount: number,
    borrowFromBudgetId: string | null | undefined,
    reversedAmounts: Map<string, number>,
  ): Promise<Split[]> {
    const wantsBorrow = !!borrowFromBudgetId;
    const lockIds = wantsBorrow ? [...new Set([budgetId, borrowFromBudgetId as string])].sort() : [budgetId];

    const locked = new Map<string, BudgetLockRow>();
    for (const id of lockIds) locked.set(id, await this.lockBudgetRow(tx, userId, id));

    const primary = locked.get(budgetId)!;
    const borrow = wantsBorrow ? locked.get(borrowFromBudgetId as string)! : null;
    return this.computeExpenseSplits(primary, amount, borrow, reversedAmounts);
  }

  async create(userId: string, dto: CreateTransactionDto, actorUserId?: string) {
    this.assertBudgetIdRequiredForExpense(dto.type, dto.budgetId);
    const transaction = await withRetry(() => prisma.$transaction(async (tx) => {
      const [account] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM accounts WHERE id = ${dto.accountId} AND "userId" = ${userId} FOR UPDATE`;
      if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

      let splits: Split[] = [];
      if (dto.budgetId && dto.type === 'EXPENSE') {
        splits = await this.lockAndResolveExpenseSplits(
          tx,
          userId,
          dto.budgetId,
          dto.amount,
          dto.borrowFromBudgetId,
          new Map(),
        );
        const affectedBudgetIds = splits.length > 0 ? splits.map((s) => s.budgetId) : [dto.budgetId];
        await assertBudgetsPeriodOpen(tx, affectedBudgetIds, new Date(dto.date));
      } else if (dto.budgetId) {
        // Non-EXPENSE with a budget: keep the existing lock-but-don't-check
        // behavior unchanged.
        await this.lockBudgetRow(tx, userId, dto.budgetId);
      }

      const created = await this.repo.create(
        {
          userId,
          accountId: dto.accountId,
          budgetId: dto.budgetId ?? null,
          amount: dto.amount,
          type: dto.type,
          description: dto.description,
          date: new Date(dto.date),
          actorUserId,
        },
        tx,
      );

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
        if (splits.length > 0) {
          for (const s of splits) {
            await tx.budget.update({ where: { id: s.budgetId }, data: { spentAmount: { increment: s.amount } } });
          }
          await tx.transactionSplit.createMany({
            data: splits.map((s) => ({ transactionId: created.id, budgetId: s.budgetId, amount: s.amount })),
          });
        } else if (dto.budgetId) {
          await tx.budget.update({
            where: { id: dto.budgetId },
            data: { spentAmount: { increment: dto.amount } },
          });
        }

        if (splits.length > 0) {
          // Just created in this same transaction — guaranteed to exist.
          return (await this.repo.findByIdWithSplits(created.id, tx))!;
        }
      }

      return created;
    }), 'transaction.create');

    return transaction;
  }

  async update(id: string, userId: string, dto: UpdateTransactionDto) {
    const existing = await this.getById(id, userId);

    if (existing.linkedTransactionId) {
      throw Object.assign(
        new Error('Cannot edit or delete a shared-pool contribution directly — reverse it instead'),
        { status: 400 },
      );
    }

    const existingSplits = await prisma.transactionSplit.findMany({ where: { transactionId: id } });

    const newType = dto.type ?? existing.type;
    const newBudgetId = dto.budgetId !== undefined ? dto.budgetId : existing.budgetId;
    this.assertBudgetIdRequiredForExpense(newType, newBudgetId);
    const newAmount = dto.amount ?? Number(existing.amount);
    // Never inherited from the prior state — see UpdateTransactionDto comment.
    const newBorrowFromBudgetId = dto.borrowFromBudgetId ?? null;

    // What this same transaction previously contributed to each budget, so
    // the remaining-amount check below isn't tripped by its own old effect.
    const oldContributionMap = new Map<string, number>();
    if (existing.type === 'EXPENSE') {
      if (existingSplits.length > 0) {
        for (const s of existingSplits) oldContributionMap.set(s.budgetId, Number(s.amount));
      } else if (existing.budgetId) {
        oldContributionMap.set(existing.budgetId, Number(existing.amount));
      }
    }

    return withRetry(() => prisma.$transaction(async (tx) => {
      let newSplits: Split[] = [];
      if (newType === 'EXPENSE' && newBudgetId) {
        newSplits = await this.lockAndResolveExpenseSplits(
          tx,
          userId,
          newBudgetId,
          newAmount,
          newBorrowFromBudgetId,
          oldContributionMap,
        );
      } else if (newBudgetId) {
        await this.lockBudgetRow(tx, userId, newBudgetId);
      }

      // Symmetric closed-period guard: block touching a transaction whose OLD
      // effect already lives in a closed month (editing history), and block
      // moving it INTO a closed month (backdating into history) — same rule,
      // checked from both directions.
      const oldAffectedBudgetIds =
        existing.type === 'EXPENSE'
          ? existingSplits.length > 0
            ? existingSplits.map((s) => s.budgetId)
            : existing.budgetId
              ? [existing.budgetId]
              : []
          : [];
      await assertBudgetsPeriodOpen(tx, oldAffectedBudgetIds, new Date(existing.date));

      const newAffectedBudgetIds =
        newType === 'EXPENSE' && newBudgetId
          ? newSplits.length > 0
            ? newSplits.map((s) => s.budgetId)
            : [newBudgetId]
          : [];
      const newDate = dto.date !== undefined ? new Date(dto.date) : new Date(existing.date);
      await assertBudgetsPeriodOpen(tx, newAffectedBudgetIds, newDate);

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
        if (existingSplits.length > 0) {
          for (const s of existingSplits) {
            await tx.budget.update({
              where: { id: s.budgetId },
              data: { spentAmount: { decrement: Number(s.amount) } },
            });
          }
        } else if (existing.budgetId) {
          await tx.budget.update({
            where: { id: existing.budgetId },
            data: { spentAmount: { decrement: Number(existing.amount) } },
          });
        }
      }
      await tx.transactionSplit.deleteMany({ where: { transactionId: id } });

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
        if (newSplits.length > 0) {
          for (const s of newSplits) {
            await tx.budget.update({ where: { id: s.budgetId }, data: { spentAmount: { increment: s.amount } } });
          }
          await tx.transactionSplit.createMany({
            data: newSplits.map((s) => ({ transactionId: id, budgetId: s.budgetId, amount: s.amount })),
          });
        } else if (newBudgetId) {
          await tx.budget.update({
            where: { id: newBudgetId },
            data: { spentAmount: { increment: newAmount } },
          });
        }
      }

      return this.repo.update(
        id,
        userId,
        {
          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.date !== undefined && { date: new Date(dto.date) }),
          ...(dto.budgetId !== undefined && { budgetId: dto.budgetId }),
        },
        tx,
      );
    }), 'transaction.update');
  }

  // No borrow support here: batch entry has no per-row UI to pick a borrow
  // source, so an over-budget row still fails exactly as before.
  async batchCreate(userId: string, items: CreateTransactionDto[]): Promise<number> {
    if (items.length === 0) return 0;

    const accountIds = [...new Set(items.map((i) => i.accountId))];
    for (const accountId of accountIds) {
      const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
      if (!account) throw Object.assign(new Error(`Account ${accountId} not found`), { status: 404 });
    }
    const budgetIds = [...new Set(items.map((i) => i.budgetId).filter(Boolean) as string[])];
    const budgetRemaining = new Map<
      string,
      { name: string; remaining: number; periodYear: number; periodMonth: number }
    >();
    for (const budgetId of budgetIds) {
      const budget = await this.budgetRepo.findById(budgetId, userId);
      if (!budget) throw Object.assign(new Error(`Budget ${budgetId} not found`), { status: 404 });
      budgetRemaining.set(budgetId, {
        name: budget.name,
        remaining: Number(budget.allocatedAmount) - Number(budget.spentAmount),
        periodYear: budget.periodYear,
        periodMonth: budget.periodMonth,
      });
    }

    for (const dto of items) {
      this.assertBudgetIdRequiredForExpense(dto.type, dto.budgetId);
      if (dto.type === 'EXPENSE' && dto.budgetId) {
        const entry = budgetRemaining.get(dto.budgetId)!;
        const txPeriod = getBangkokYearMonth(new Date(dto.date));
        if (isBeforeYearMonth(txPeriod, { year: entry.periodYear, month: entry.periodMonth })) {
          throw closedPeriodError();
        }
        if (dto.amount > entry.remaining) {
          throw Object.assign(
            new Error(
              `งบ "${entry.name}" ไม่พอ — เหลือ ${entry.remaining.toFixed(2)} บาท ขาด ${(dto.amount - entry.remaining).toFixed(2)} บาท กรุณาโยกงบจากกลุ่มอื่นก่อน`,
            ),
            { status: 400, code: 'BUDGET_INSUFFICIENT' },
          );
        }
        entry.remaining -= dto.amount;
      }
    }

    await withRetry(() => prisma.$transaction(async (tx) => {
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
    }), 'transaction.batchCreate');

    return items.length;
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.getById(id, userId);

    if (existing.linkedTransactionId) {
      throw Object.assign(
        new Error('Cannot edit or delete a shared-pool contribution directly — reverse it instead'),
        { status: 400 },
      );
    }

    const splits = await prisma.transactionSplit.findMany({ where: { transactionId: id } });

    await withRetry(() => prisma.$transaction(async (tx) => {
      const affectedBudgetIds =
        existing.type === 'EXPENSE'
          ? splits.length > 0
            ? splits.map((s) => s.budgetId)
            : existing.budgetId
              ? [existing.budgetId]
              : []
          : [];
      await assertBudgetsPeriodOpen(tx, affectedBudgetIds, new Date(existing.date));

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
        if (splits.length > 0) {
          for (const s of splits) {
            await tx.budget.update({
              where: { id: s.budgetId },
              data: { spentAmount: { decrement: Number(s.amount) } },
            });
          }
        } else if (existing.budgetId) {
          await tx.budget.update({
            where: { id: existing.budgetId },
            data: { spentAmount: { decrement: Number(existing.amount) } },
          });
        }
      }

      // Deleting the Transaction row cascades to its TransactionSplit rows.
      await this.repo.delete(id, userId, tx);
    }), 'transaction.delete');
  }
}
