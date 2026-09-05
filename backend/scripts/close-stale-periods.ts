// One-time catch-up for the monthly reset/rollover feature (Phase 3).
//
// closeAndAdvancePeriodsForUser() was designed to run lazily (before every
// budget/dashboard read) and from the daily cron, but neither wiring ever
// shipped — it was only ever called from tests. Production budgets have
// been stuck on whatever period they were migrated into back in 2026-08.
// Deploying the wiring fix alone only stops things from getting *more*
// stale from here on — it does not retroactively catch up what already
// fell behind, since a budget only closes the next time something reads it.
// This script forces that catch-up once, for every user, right after the
// fix deploys, instead of waiting for each user's next login to self-heal
// one at a time (a nondeterministic rollout where some users see corrected
// numbers immediately and others don't until they happen to open the app).
//
// Usage:
//   npx tsx scripts/close-stale-periods.ts                       # dry run (default, no writes)
//   npx tsx scripts/close-stale-periods.ts --write --db=<dbname>    # actually writes
//   npx tsx scripts/close-stale-periods.ts --skip=a@x.com,b@x.com  # exclude specific users
//
// --db=<dbname> must match the database name in DATABASE_URL exactly — same
// guard as backfill-period-spend.ts, the only thing standing between a
// copy-pasted command and writing to the wrong database.
//
// --skip=<email1,email2,...> excludes those users entirely (dry run and
// write both) — use this for a user whose data needs a manual correction
// first (e.g. a pre-existing zero-based invariant violation from an
// unrelated bug) so the close doesn't run against their still-wrong numbers
// before that correction lands. Re-run without --skip once they're fixed.
//
// Dry run reuses the real close logic (RESET pool math included) inside an
// actual DB transaction that gets rolled back instead of committed — not a
// separate reimplementation — so the preview can never drift from what
// --write would actually do.

import { prisma } from '../src/config/database';
import { BudgetService } from '../src/features/budgets/budget.service';

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
  const skipEmails = new Set(
    (args.find((a) => a.startsWith('--skip='))?.slice('--skip='.length) ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

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

  if (skipEmails.size > 0) {
    console.log(`Skipping: ${[...skipEmails].join(', ')}`);
  }

  const budgetService = new BudgetService();
  const allUsers = await prisma.user.findMany({ select: { id: true, email: true } });
  const users = allUsers.filter((u) => !skipEmails.has(u.email.toLowerCase()));
  const skippedCount = allUsers.length - users.length;
  if (skipEmails.size > skippedCount) {
    console.log(
      `Warning: ${skipEmails.size - skippedCount} email(s) in --skip matched no user — check for typos.`,
    );
  }

  let usersChanged = 0;
  let budgetMonthsClosed = 0;

  for (const user of users) {
    const report = await budgetService.closeAndAdvancePeriodsForUser(user.id, undefined, { dryRun: !write });
    if (report.length === 0) continue;

    usersChanged++;
    console.log(`\n--- ${user.email} (${user.id})`);
    for (const entry of report) {
      budgetMonthsClosed++;
      console.log(
        `[${write ? 'WRITE' : 'DRY'}] "${entry.budgetName}" (${entry.policy}): ` +
          `period ${entry.closedPeriod.year}-${String(entry.closedPeriod.month).padStart(2, '0')} -> ` +
          `${entry.newPeriod.year}-${String(entry.newPeriod.month).padStart(2, '0')}, ` +
          `allocated ${entry.oldAllocated.toFixed(2)} -> ${entry.newAllocated.toFixed(2)}, ` +
          `spent ${entry.oldSpent.toFixed(2)} -> 0.00`,
      );
    }
  }

  console.log(
    `\n${usersChanged} user(s) / ${budgetMonthsClosed} budget-month(s) ${write ? 'closed' : 'would be closed'}, ` +
      `${users.length - usersChanged} user(s) already current` +
      (skippedCount > 0 ? `, ${skippedCount} user(s) skipped.` : '.'),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
