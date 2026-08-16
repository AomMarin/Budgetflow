// One-time backfill for the monthly reset/rollover feature (Phase 3).
//
// Budget.spentAmount has always been lifetime-cumulative (see comment in
// reports.service.ts) — it was never reset per calendar month. Once
// periodYear/periodMonth start being read as "this budget's current month",
// every budget's spentAmount must first be trimmed down to just its current
// Bangkok-calendar-month spend, or remaining amounts go wrong the moment this
// ships. This script does that trim, and stamps periodYear/periodMonth to the
// current Bangkok month at the same time.
//
// Usage:
//   npx tsx scripts/backfill-period-spend.ts                    # dry run (default, no writes)
//   npx tsx scripts/backfill-period-spend.ts --write --db=<dbname>   # actually writes
//
// --db=<dbname> must match the database name in DATABASE_URL exactly — same
// spirit as src/test/setup.ts refusing to run against a non-test DB, except
// here it's a positive confirmation: you must name the DB you think you're
// writing to, or the script refuses. This is the only thing standing between
// a copy-pasted command and writing to the wrong database.

import { prisma } from '../src/config/database';
import { getBangkokYearMonth, bangkokMonthRangeUtc } from '../src/utils/period';
import { getExpenseByBudget } from '../src/utils/split-aware-spend';

function parseDbNameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '(unparseable DATABASE_URL)';
  }
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
      throw new Error(
        `Refusing to write: pass --db=${actualDbName} to explicitly confirm the target database ` +
          `(prevents writing to the wrong DATABASE_URL by accident).`,
      );
    }
    if (dbArg !== actualDbName) {
      throw new Error(
        `Refusing to write: --db=${dbArg} does not match the database DATABASE_URL actually points ` +
          `at ("${actualDbName}"). Re-check DATABASE_URL before retrying.`,
      );
    }
  }

  const { year, month } = getBangkokYearMonth();
  const { start, end } = bangkokMonthRangeUtc(year, month);
  console.log(`Current Bangkok period: ${year}-${String(month).padStart(2, '0')} (${start.toISOString()} .. ${end.toISOString()})`);

  const budgets = await prisma.budget.findMany({
    where: { isArchived: false },
    select: { id: true, userId: true, name: true, spentAmount: true, periodYear: true, periodMonth: true },
    orderBy: [{ userId: 'asc' }, { sortOrder: 'asc' }],
  });

  const userIds = [...new Set(budgets.map((b) => b.userId))];
  const spendByUser = new Map<string, Record<string, { amount: number; count: number }>>();
  for (const userId of userIds) {
    spendByUser.set(userId, await getExpenseByBudget(userId, start, end));
  }

  let changed = 0;
  let unchanged = 0;

  for (const budget of budgets) {
    const oldSpent = Number(budget.spentAmount);
    const newSpent = spendByUser.get(budget.userId)?.[budget.id]?.amount ?? 0;
    const periodAlreadyCurrent = budget.periodYear === year && budget.periodMonth === month;
    // Epsilon, not ===: newSpent is a float SUM() over several transaction
    // amounts, oldSpent a single stored Decimal — binary-float summation can
    // land a cent-identical value a hair off (e.g. 150.29999999999998 vs
    // 150.3), which would falsely report "changed" on every re-run and
    // undermine the dry-run diff an operator is trusting before writing to
    // Neon. Same tolerance as assertZeroBasedInvariant in test/helpers.ts.
    const spentAlreadyCorrect = Math.abs(oldSpent - newSpent) < 0.005;

    if (spentAlreadyCorrect && periodAlreadyCurrent) {
      unchanged++;
      continue;
    }

    changed++;
    console.log(
      `[${write ? 'WRITE' : 'DRY'}] budget ${budget.id} "${budget.name}" (user ${budget.userId}): ` +
        `spentAmount ${oldSpent.toFixed(2)} -> ${newSpent.toFixed(2)}, ` +
        `period ${budget.periodYear}-${budget.periodMonth} -> ${year}-${month}`,
    );

    if (write) {
      await prisma.budget.update({
        where: { id: budget.id },
        data: { spentAmount: newSpent, periodYear: year, periodMonth: month },
      });
    }
  }

  console.log(`\n${changed} budget(s) ${write ? 'updated' : 'would be updated'}, ${unchanged} already correct.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
