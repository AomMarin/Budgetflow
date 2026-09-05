// One-time data migration for the session-based budget model (see design
// doc / plan: "Session-based Budget Model — Schema Phase").
//
// BudgetSession is additive-only right now (see comment on the model in
// schema.prisma) — nothing reads or writes it yet. This script populates it
// from the two sources of truth that still exist:
//   - Budget.allocatedAmount/spentAmount/periodYear/periodMonth (the live,
//     current-period numbers) -> one BudgetSession per budget, status OPEN.
//   - BudgetMonthlyHistory (closed months) -> one BudgetSession per row,
//     status CLOSED, closedAt copied.
//
// Idempotent: upserts on the same @@unique([budgetId, periodYear,
// periodMonth]) BudgetSession already declares, so re-running after a
// partial write (or after new activity closes more months) only adds what's
// missing. Does NOT drop BudgetMonthlyHistory or touch Budget's own columns
// — that's a separate, later migration once this backfill is verified.
//
// Two edge cases worth calling out explicitly (verified against fixture
// budgets, not just reasoned about):
//   - Archived budget -> session gets status CLOSED, not OPEN (see the
//     isArchived check below) — see that comment for why.
//   - A budget whose periodYear/periodMonth is BEHIND the current Bangkok
//     month (the lazy-close hook hasn't caught it up yet) -> still gets
//     status OPEN, at its own (stale) period, deliberately. This mirrors
//     exactly what closeAndAdvancePeriodsForUser already does today with a
//     stale Budget row: it's not this script's job to run that close logic
//     (duplicating it here would risk drifting from the real implementation)
//     — the future session-aware version of that same function already has
//     to handle "OPEN session with period < current" as its normal
//     multi-month catch-up case, so a stale OPEN row here is a correct
//     starting state, not a bug to work around.
//
// Usage:
//   npx tsx scripts/migrate-budget-sessions.ts                    # dry run (default, no writes)
//   npx tsx scripts/migrate-budget-sessions.ts --write --db=<dbname>   # actually writes

import { prisma } from '../src/config/database';

function parseDbNameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

interface PlannedSession {
  budgetId: string;
  userId: string;
  periodYear: number;
  periodMonth: number;
  allocatedAmount: number;
  spentAmount: number;
  rolloverPolicy: 'RESET' | 'ROLLOVER' | 'SWEEP';
  status: 'OPEN' | 'CLOSED';
  closedAt: Date | null;
  source: string;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const dbArg = args.find((a) => a.startsWith('--db='))?.slice('--db='.length);

  const rawUrl = process.env.DATABASE_URL ?? '';
  const actualDbName = parseDbNameFromUrl(rawUrl);

  console.log(`Target database: "${actualDbName}"`);
  console.log(`Mode: ${write ? 'WRITE' : 'DRY RUN (no writes)'}`);

  if (write) {
    if (!dbArg) {
      throw new Error(`Refusing to write: pass --db=${actualDbName} to explicitly confirm the target database.`);
    }
    if (dbArg !== actualDbName) {
      throw new Error(
        `Refusing to write: --db=${dbArg} does not match the database DATABASE_URL actually points ` +
          `at ("${actualDbName}"). Re-check DATABASE_URL before retrying.`,
      );
    }
  }

  const budgets = await prisma.budget.findMany({
    select: {
      id: true,
      userId: true,
      name: true,
      allocatedAmount: true,
      spentAmount: true,
      periodYear: true,
      periodMonth: true,
      rolloverPolicy: true,
      isArchived: true,
    },
  });

  const history = await prisma.budgetMonthlyHistory.findMany({
    select: {
      budgetId: true,
      userId: true,
      year: true,
      month: true,
      allocatedAmount: true,
      spentAmount: true,
      rolloverPolicy: true,
      closedAt: true,
    },
  });

  const planned: PlannedSession[] = [];

  for (const b of budgets) {
    // Archived budgets are excluded from findAll()/closeAndAdvancePeriodsForUser
    // forever (see budget.repository.ts), so nothing will ever close this
    // session going forward — inserting it as OPEN would leave a permanently
    // stuck "current" row that a future "list all open sessions" query could
    // wrongly surface. It's not a live period either way (the budget is
    // done), so CLOSED preserves the final snapshot (still needed once
    // Budget's own allocatedAmount/spentAmount columns are dropped) without
    // claiming it's an active month. closedAt is null, not a real close
    // timestamp — archiving isn't a month-close event and nothing here can
    // reconstruct when it happened.
    planned.push({
      budgetId: b.id,
      userId: b.userId,
      periodYear: b.periodYear,
      periodMonth: b.periodMonth,
      allocatedAmount: Number(b.allocatedAmount),
      spentAmount: Number(b.spentAmount),
      rolloverPolicy: b.rolloverPolicy,
      status: b.isArchived ? 'CLOSED' : 'OPEN',
      closedAt: null,
      source: `budget ${b.id} "${b.name}"${b.isArchived ? ' (archived)' : ''}`,
    });
  }

  for (const h of history) {
    planned.push({
      budgetId: h.budgetId,
      userId: h.userId,
      periodYear: h.year,
      periodMonth: h.month,
      allocatedAmount: Number(h.allocatedAmount),
      spentAmount: Number(h.spentAmount),
      rolloverPolicy: h.rolloverPolicy,
      status: 'CLOSED',
      closedAt: h.closedAt,
      source: `history ${h.budgetId} ${h.year}-${h.month}`,
    });
  }

  // Guard against the one way this could silently corrupt data: a budget's
  // *current* (OPEN) period colliding with one of its own *closed* history
  // rows would violate the unique(budgetId, periodYear, periodMonth) that's
  // meant to make this idempotent, and upserting would let the wrong one win
  // depending on iteration order. This should never happen if
  // closeAndAdvancePeriodsForUser always advances the period forward — but
  // don't assume that silently, check it.
  const seen = new Map<string, PlannedSession>();
  const conflicts: Array<{ a: PlannedSession; b: PlannedSession }> = [];
  for (const p of planned) {
    const key = `${p.budgetId}:${p.periodYear}-${p.periodMonth}`;
    const existing = seen.get(key);
    if (existing) {
      conflicts.push({ a: existing, b: p });
    } else {
      seen.set(key, p);
    }
  }

  if (conflicts.length > 0) {
    console.error(`\n${conflicts.length} conflict(s) found — refusing to proceed:`);
    for (const { a, b } of conflicts) {
      console.error(`  ${a.source} (${a.status}) vs ${b.source} (${b.status}) both claim the same period`);
    }
    throw new Error('Resolve conflicts before running this migration.');
  }

  const existingSessions = await prisma.budgetSession.findMany({
    select: { budgetId: true, periodYear: true, periodMonth: true },
  });
  const existingKeys = new Set(existingSessions.map((s) => `${s.budgetId}:${s.periodYear}-${s.periodMonth}`));

  let toCreate = 0;
  let alreadyPresent = 0;

  for (const p of planned) {
    const key = `${p.budgetId}:${p.periodYear}-${p.periodMonth}`;
    if (existingKeys.has(key)) {
      alreadyPresent++;
      continue;
    }
    toCreate++;
    console.log(
      `[${write ? 'WRITE' : 'DRY'}] ${p.source}: create BudgetSession ${p.periodYear}-${String(p.periodMonth).padStart(2, '0')} ` +
        `status=${p.status} allocated=${p.allocatedAmount.toFixed(2)} spent=${p.spentAmount.toFixed(2)} policy=${p.rolloverPolicy}`,
    );

    if (write) {
      await prisma.budgetSession.upsert({
        where: {
          budgetId_periodYear_periodMonth: {
            budgetId: p.budgetId,
            periodYear: p.periodYear,
            periodMonth: p.periodMonth,
          },
        },
        create: {
          budgetId: p.budgetId,
          userId: p.userId,
          periodYear: p.periodYear,
          periodMonth: p.periodMonth,
          allocatedAmount: p.allocatedAmount,
          spentAmount: p.spentAmount,
          rolloverPolicy: p.rolloverPolicy,
          status: p.status,
          closedAt: p.closedAt,
        },
        update: {},
      });
    }
  }

  console.log(
    `\n${toCreate} session(s) ${write ? 'created' : 'would be created'}, ${alreadyPresent} already present ` +
      `(from ${budgets.length} budget(s) + ${history.length} history row(s), 0 conflicts).`,
  );

  if (write) {
    const finalCount = await prisma.budgetSession.count();
    const expected = alreadyPresent + toCreate;
    console.log(`Verification: budget_sessions now has ${finalCount} row(s), expected ${expected}.`);
    if (finalCount !== expected) {
      throw new Error(`Row count mismatch after write — got ${finalCount}, expected ${expected}. Investigate before trusting this table.`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
