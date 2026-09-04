import { Budget, Prisma, RolloverPolicy } from '@prisma/client';
import { BudgetRepository } from './budget.repository';
import { CreateBudgetDto, UpdateBudgetDto, AllocateIncomeDto } from './budget.dto';
import { prisma } from '../../config/database';
import { getBangkokYearMonth, nextYearMonth, isBeforeYearMonth, YearMonth } from '../../utils/period';
import { logger } from '../../utils/logger';
import { withRetry } from '../../utils/db-retry';

function periodOf(budget: Budget): YearMonth {
  return { year: budget.periodYear, month: budget.periodMonth };
}

// Thrown from inside the close transaction to force a rollback when the
// caller only wants a preview (script --dry-run) — Postgres rolls back the
// whole transaction on any thrown error, so nothing this call did persists.
// Not a Prisma error class, so db-retry's isRetryableConnectionError() never
// matches it and never retries or logs it as a failure.
class DryRunAbort extends Error {}

export interface CloseReportEntry {
  userId: string;
  budgetId: string;
  budgetName: string;
  policy: RolloverPolicy;
  closedPeriod: YearMonth;
  newPeriod: YearMonth;
  oldAllocated: number;
  oldSpent: number;
  newAllocated: number;
}

export interface BudgetWithStats extends Budget {
  remainingAmount: number;
  usagePercent: number;
  alertLevel: '80' | '90' | '100' | null;
}

export class BudgetService {
  constructor(private readonly repo = new BudgetRepository()) {}

  async getAll(userId: string): Promise<BudgetWithStats[]> {
    await this.closeAndAdvancePeriodsForUser(userId);
    const budgets = await this.repo.findAll(userId);
    return budgets.map(this.addStats);
  }

  async getById(id: string, userId: string): Promise<BudgetWithStats> {
    const budget = await this.repo.findById(id, userId);
    if (!budget) throw Object.assign(new Error('Budget not found'), { status: 404 });
    return this.addStats(budget);
  }

  // Per-user mutex for the Sigma(allocated) <= Sigma(balance) invariant check.
  // Row-level FOR UPDATE on the existing budgets/accounts can't guard this by
  // itself: a newly INSERTed budget row is invisible to a concurrent
  // transaction's locked SELECT until it commits (phantom read), so two
  // concurrent creates can each pass the check against the same stale totals.
  // Locking a stable, always-existing key (hash of userId) forces the second
  // transaction to fully wait, then re-read fresh totals that include the
  // first transaction's committed row.
  private async lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;
  }

  private async getTotalBalance(userId: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
    const result = await db.account.aggregate({
      where: { userId },
      _sum: { balance: true },
    });
    return Number(result._sum.balance ?? 0);
  }

  private assertRolloverPolicySupported(policy: RolloverPolicy | undefined): void {
    if (policy === RolloverPolicy.ROLLOVER) {
      throw Object.assign(new Error('ยังไม่เปิดใช้งาน Rollover ในตอนนี้ กรุณาเลือก Reset หรือ Sweep'), {
        status: 400,
      });
    }
  }

  async create(userId: string, dto: CreateBudgetDto): Promise<BudgetWithStats> {
    this.assertRolloverPolicySupported(dto.rolloverPolicy);
    const budget = await withRetry(() => prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);

      const [{ totalRemaining }, totalBalance] = await Promise.all([
        this.repo.getAllocationTotals(userId, tx),
        this.getTotalBalance(userId, tx),
      ]);
      // Spent money already left the account balance (see transaction.service.ts
      // EXPENSE handling), but allocatedAmount never shrinks when spent — it's a
      // permanent earmark. Subtracting totalAllocated here would double-count
      // that spent money (once via balance, once via allocatedAmount), so the
      // check must compare against totalRemaining (still-earmarked, unspent),
      // not totalAllocated. Do not change this back to totalAllocated.
      const available = totalBalance - totalRemaining;
      if (dto.allocatedAmount > available) {
        throw Object.assign(
          new Error(`จัดสรรเกินยอดคงเหลือ จัดสรรได้อีก ${available.toFixed(2)} บาท`),
          { status: 400 },
        );
      }
      return this.repo.create(userId, dto, tx);
    }), 'budget.create');
    return this.addStats(budget);
  }

  async update(id: string, userId: string, dto: UpdateBudgetDto): Promise<BudgetWithStats> {
    this.assertRolloverPolicySupported(dto.rolloverPolicy);
    const budget = await withRetry(() => prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);

      const existing = await tx.budget.findFirst({ where: { id, userId } });
      if (!existing) throw Object.assign(new Error('Budget not found'), { status: 404 });
      if (existing.isArchived) {
        throw Object.assign(new Error('ไม่สามารถแก้ไขงบที่เก็บถาวรแล้ว'), { status: 400 });
      }

      if (dto.allocatedAmount !== undefined) {
        const existingSpent = Number(existing.spentAmount);
        if (dto.allocatedAmount < existingSpent) {
          throw Object.assign(
            new Error(
              `ลดยอดจัดสรรต่ำกว่ายอดที่ใช้ไปแล้วไม่ได้ (ใช้ไปแล้ว ${existingSpent.toFixed(2)} บาท)`,
            ),
            { status: 400 },
          );
        }

        const [{ totalRemaining }, totalBalance] = await Promise.all([
          this.repo.getAllocationTotals(userId, tx),
          this.getTotalBalance(userId, tx),
        ]);
        // Same fix as create(): compare against totalRemaining (unspent
        // earmarks), not totalAllocated, or spent money gets double-counted
        // against the balance. See create() for the full explanation.
        // existing's own floored remaining is backed out and replaced by the
        // proposed dto.allocatedAmount below — safe because the guard above
        // guarantees existing.allocatedAmount >= existingSpent, so the floor
        // never actually clips it (floor(x) === x for x >= 0).
        const existingRemaining = Number(existing.allocatedAmount) - existingSpent;
        const available = totalBalance - (totalRemaining - existingRemaining);
        if (dto.allocatedAmount > available) {
          throw Object.assign(
            new Error(`จัดสรรเกินยอดคงเหลือ จัดสรรได้สูงสุด ${available.toFixed(2)} บาท`),
            { status: 400 },
          );
        }
      }

      return this.repo.update(id, userId, dto, tx);
    }), 'budget.update');
    return this.addStats(budget);
  }

  async delete(id: string, userId: string): Promise<void> {
    const budget = await this.repo.findById(id, userId);
    if (!budget) throw Object.assign(new Error('Budget not found'), { status: 404 });

    const txCount = await prisma.transaction.count({ where: { budgetId: id } });
    if (txCount > 0) {
      await this.repo.archive(id, userId);
    } else {
      await this.repo.delete(id, userId);
    }
  }

  async allocateIncome(userId: string, dto: AllocateIncomeDto): Promise<void> {
    const account = await prisma.account.findFirst({
      where: { id: dto.accountId, userId },
    });
    if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

    const totalAllocating = dto.allocations.reduce((sum, a) => sum + a.amount, 0);
    if (totalAllocating > dto.totalAmount) {
      throw Object.assign(
        new Error('Total allocations exceed income amount'),
        { status: 400 },
      );
    }

    await withRetry(() => prisma.$transaction(async (tx) => {
      // Record income and increase account balance
      await tx.transaction.create({
        data: {
          userId,
          accountId: dto.accountId,
          type: 'INCOME',
          amount: dto.totalAmount,
          description: dto.note || 'Income',
          date: new Date(),
        },
      });

      await tx.account.update({
        where: { id: dto.accountId },
        data: { balance: { increment: dto.totalAmount } },
      });

      // Allocate to budgets
      for (const alloc of dto.allocations) {
        const budget = await tx.budget.findFirst({ where: { id: alloc.budgetId, userId } });
        if (!budget) throw new Error(`Budget ${alloc.budgetId} not found`);

        await tx.budget.update({
          where: { id: alloc.budgetId },
          data: { allocatedAmount: { increment: alloc.amount } },
        });

        await tx.allocation.create({
          data: {
            userId,
            budgetId: alloc.budgetId,
            amount: alloc.amount,
            note: dto.note,
          },
        });
      }
    }), 'budget.allocateIncome');
  }

  async reorder(userId: string, orderedIds: string[]): Promise<void> {
    await withRetry(
      () =>
        prisma.$transaction(
          orderedIds.map((id, index) =>
            prisma.budget.updateMany({
              where: { id, userId },
              data: { sortOrder: index },
            }),
          ),
        ),
      'budget.reorder',
    );
  }

  async checkAlerts(
    userId: string,
  ): Promise<Array<{ budgetId: string; name: string; level: 80 | 90 | 100; usagePercent: number }>> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];

    const budgets = await this.repo.findAll(userId);
    const triggered: Array<{ budgetId: string; name: string; level: 80 | 90 | 100; usagePercent: number }> = [];

    for (const budget of budgets) {
      const stats = this.addStats(budget);
      const currentLevel = stats.alertLevel ? (Number(stats.alertLevel) as 80 | 90 | 100) : null;
      const storedLevel = budget.lastAlertedLevel as 80 | 90 | 100 | null;

      if (currentLevel === storedLevel) continue;

      if (currentLevel !== null && (storedLevel === null || currentLevel > storedLevel)) {
        const prefEnabled =
          currentLevel === 80 ? user.alertAt80 : currentLevel === 90 ? user.alertAt90 : user.alertAt100;
        if (prefEnabled) {
          triggered.push({
            budgetId: budget.id,
            name: budget.name,
            level: currentLevel,
            usagePercent: stats.usagePercent,
          });
        }
      }

      await this.repo.updateAlertLevel(budget.id, currentLevel);
    }

    return triggered;
  }

  // Closes every calendar month a user's budgets have fallen behind on, up to
  // `now` (Asia/Bangkok), advancing periodYear/periodMonth as it goes. Called
  // from both the daily cron and lazily before any budget read, so it must be
  // a cheap no-op once every budget's period already matches the current one.
  //
  // Runs as ONE transaction per user, under lockUser — RESET budgets in pass 2
  // draw from a pool shared across the whole user's budgets, so two closes
  // (cron + a lazy hook) racing for the same pool would double-spend it
  // without this lock, same hazard as create()/update() above.
  //
  // Processing is month-major: for each calendar month still owed, pass 1
  // closes every SWEEP/ROLLOVER budget first (purely local, never touches the
  // pool — SWEEP frees pool room, ROLLOVER leaves it unchanged), then pass 2
  // closes RESET budgets in sortOrder, re-querying the pool fresh (via the
  // same tx, so it sees every write already committed in this call) before
  // each one — first-come-first-served if the pool runs out mid-pass.
  // `dryRun: true` runs the exact same close logic (same math, same pool
  // contention across budgets) inside a real transaction, then rolls it back
  // instead of committing — so the returned report reflects what a real run
  // would do without writing anything. Used by scripts/close-stale-periods.ts;
  // production call sites (getAll/getSummary/daily cron) never pass this.
  async closeAndAdvancePeriodsForUser(
    userId: string,
    now: Date = new Date(),
    options?: { dryRun?: boolean },
  ): Promise<CloseReportEntry[]> {
    const current = getBangkokYearMonth(now);
    const dryRun = options?.dryRun ?? false;
    const report: CloseReportEntry[] = [];

    const runClose = () =>
      prisma.$transaction(
        async (tx) => {
          await this.lockUser(tx, userId);

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const budgets = await this.repo.findAll(userId, tx);
            const behind = budgets.filter((b) => isBeforeYearMonth(periodOf(b), current));
            if (behind.length === 0) break;

            for (const budget of behind) {
              if (budget.rolloverPolicy === RolloverPolicy.RESET) continue;
              report.push(await this.closeLocalBudgetMonth(tx, budget));
            }

            const resetBehind = behind
              .filter((b) => b.rolloverPolicy === RolloverPolicy.RESET)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            for (const stub of resetBehind) {
              report.push(await this.closeResetBudgetMonth(tx, userId, stub.id));
            }
          }

          if (dryRun) throw new DryRunAbort();
        },
        { timeout: 30000 },
      );

    try {
      // No withRetry on the dry-run path: it's an interactive one-off script
      // call, not a production request, and withRetry's unconditional error
      // log would misreport this intentional rollback as a failure.
      if (dryRun) await runClose();
      else await withRetry(runClose, 'budget.closeAndAdvancePeriodsForUser');
    } catch (err) {
      if (!(err instanceof DryRunAbort)) throw err;
    }

    return report;
  }

  // SWEEP / ROLLOVER: purely local to this budget, no pool involved.
  private async closeLocalBudgetMonth(tx: Prisma.TransactionClient, budget: Budget): Promise<CloseReportEntry> {
    const oldAllocated = Number(budget.allocatedAmount);
    const oldSpent = Number(budget.spentAmount);
    const newAllocated =
      budget.rolloverPolicy === RolloverPolicy.ROLLOVER ? Math.max(oldAllocated - oldSpent, 0) : 0;

    return this.commitMonthClose(tx, budget, oldAllocated, oldSpent, newAllocated);
  }

  // RESET: draws from the pool shared across the user's whole budget set.
  // Re-fetches the budget and the pool fresh inside tx — must not reuse the
  // stale `behind` snapshot from the caller's loop, since prior budgets
  // closed earlier in this same pass already changed both.
  private async closeResetBudgetMonth(
    tx: Prisma.TransactionClient,
    userId: string,
    budgetId: string,
  ): Promise<CloseReportEntry> {
    const budget = await tx.budget.findUniqueOrThrow({ where: { id: budgetId } });
    const oldAllocated = Number(budget.allocatedAmount);
    const oldSpent = Number(budget.spentAmount);
    const oldRemaining = Math.max(oldAllocated - oldSpent, 0);

    const [{ totalRemaining }, totalBalance] = await Promise.all([
      this.repo.getAllocationTotals(userId, tx),
      this.getTotalBalance(userId, tx),
    ]);
    const pool = totalBalance - totalRemaining;
    // A negative pool means Sigma(remaining) already exceeds balance BEFORE
    // this budget's close — the zero-based invariant was already broken by
    // something upstream of Phase 3 (legacy data, a race, a manual DB edit).
    // Clamping below silently no-ops the top-up so this never makes the
    // violation worse, but it also can't fix it — log it so a negative pool
    // doesn't pass by unnoticed.
    if (pool < 0) {
      logger.warn(
        `RESET close for budget ${budget.id} (user ${userId}) found a negative pool ` +
          `(balance=${totalBalance.toFixed(2)}, totalRemaining=${totalRemaining.toFixed(2)}, pool=${pool.toFixed(2)}) — ` +
          `zero-based invariant was already violated before this close ran.`,
      );
    }

    const target = budget.monthlyTarget !== null ? Number(budget.monthlyTarget) : oldAllocated;
    const topup = Math.min(Math.max(target - oldRemaining, 0), Math.max(pool, 0));
    const newAllocated = oldRemaining + topup;

    return this.commitMonthClose(tx, budget, oldAllocated, oldSpent, newAllocated);
  }

  private async commitMonthClose(
    tx: Prisma.TransactionClient,
    budget: Budget,
    oldAllocated: number,
    oldSpent: number,
    newAllocated: number,
  ): Promise<CloseReportEntry> {
    const closedPeriod = periodOf(budget);
    const next = nextYearMonth(closedPeriod);

    await tx.budget.update({
      where: { id: budget.id },
      data: {
        allocatedAmount: newAllocated,
        spentAmount: 0,
        periodYear: next.year,
        periodMonth: next.month,
      },
    });

    await tx.budgetMonthlyHistory.upsert({
      where: {
        budgetId_year_month: { budgetId: budget.id, year: closedPeriod.year, month: closedPeriod.month },
      },
      create: {
        budgetId: budget.id,
        userId: budget.userId,
        year: closedPeriod.year,
        month: closedPeriod.month,
        allocatedAmount: oldAllocated,
        spentAmount: oldSpent,
        rolloverPolicy: budget.rolloverPolicy,
      },
      update: {},
    });

    return {
      userId: budget.userId,
      budgetId: budget.id,
      budgetName: budget.name,
      policy: budget.rolloverPolicy,
      closedPeriod,
      newPeriod: next,
      oldAllocated,
      oldSpent,
      newAllocated,
    };
  }

  private addStats(budget: Budget): BudgetWithStats {
    const allocated = Number(budget.allocatedAmount);
    const spent = Number(budget.spentAmount);
    const remaining = allocated - spent;
    const usagePercent = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;

    let alertLevel: BudgetWithStats['alertLevel'] = null;
    if (usagePercent >= 100) alertLevel = '100';
    else if (usagePercent >= 90) alertLevel = '90';
    else if (usagePercent >= 80) alertLevel = '80';

    return { ...budget, remainingAmount: remaining, usagePercent, alertLevel };
  }
}
