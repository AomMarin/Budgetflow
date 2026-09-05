// One-time historical correction for the mindmint@budgetflow.app incident
// (see transaction.expense-budget-required.test.ts). Two EXPENSE transactions
// from August 2026 were created before EXPENSE required a budgetId, so they
// decremented Account.balance without ever being attributed to a budget.
//
// August has already been closed correctly by the period-close lazy hook —
// current invariant (Sigma(remaining) <= balance) already holds. This script
// does NOT touch any spentAmount (current or historical) — backfilling that
// would misattribute an August expense into September's live spend. It only
// sets budgetId on the two known transactions so they show up correctly
// attributed in transaction lists/reports going forward. History correction
// for August's BudgetMonthlyHistory row is backlogged separately.
//
// Usage:
//   npx tsx scripts/attribute-mindmint-legacy-transactions.ts                  # dry run (default)
//   npx tsx scripts/attribute-mindmint-legacy-transactions.ts --write --db=<dbname>  # actually writes

import { prisma } from '../src/config/database';

const TARGET_EMAIL = 'mindmint@budgetflow.app';
const TARGET_BUDGET_NAME = 'ค่ากิน';

// Pinned to the exact rows confirmed during investigation — not a generic
// "any unbudgeted EXPENSE" scan, so this script can never accidentally pick
// up an unrelated future gap.
const TARGET_TRANSACTIONS = [
  { id: 'cmslrfj7g000yrx9tl9l9p5ri', amount: 800, description: 'ค่าติ๊กต๊อก' },
  { id: 'cmsmxtju600021lll86klg32w', amount: 281.25, description: 'ค่าคีบอร์ด' },
];

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
        `Refusing to write: pass --db=${actualDbName} to explicitly confirm the target database.`,
      );
    }
    if (dbArg !== actualDbName) {
      throw new Error(
        `Refusing to write: --db=${dbArg} does not match the database DATABASE_URL actually points ` +
          `at ("${actualDbName}"). Re-check DATABASE_URL before retrying.`,
      );
    }
  }

  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) {
    throw new Error(`User ${TARGET_EMAIL} not found — nothing to do.`);
  }

  const budget = await prisma.budget.findFirst({
    where: { userId: user.id, name: TARGET_BUDGET_NAME, isArchived: false },
  });
  if (!budget) {
    throw new Error(`Budget "${TARGET_BUDGET_NAME}" not found for ${TARGET_EMAIL} — nothing to do.`);
  }
  console.log(`Target budget: "${budget.name}" (${budget.id})`);

  let changed = 0;
  let skipped = 0;

  for (const expected of TARGET_TRANSACTIONS) {
    const tx = await prisma.transaction.findUnique({ where: { id: expected.id } });
    if (!tx) {
      console.log(`[SKIP] transaction ${expected.id} ("${expected.description}") not found.`);
      skipped++;
      continue;
    }
    if (tx.userId !== user.id) {
      console.log(`[SKIP] transaction ${expected.id} does not belong to ${TARGET_EMAIL} — refusing to touch.`);
      skipped++;
      continue;
    }
    if (Number(tx.amount) !== expected.amount || tx.description !== expected.description) {
      console.log(
        `[SKIP] transaction ${expected.id} amount/description mismatch ` +
          `(expected ${expected.amount} "${expected.description}", got ${Number(tx.amount)} "${tx.description}") — refusing to touch.`,
      );
      skipped++;
      continue;
    }
    if (tx.budgetId !== null) {
      console.log(`[SKIP] transaction ${expected.id} already has budgetId=${tx.budgetId} — already fixed.`);
      skipped++;
      continue;
    }

    changed++;
    console.log(
      `[${write ? 'WRITE' : 'DRY'}] transaction ${tx.id} "${tx.description}" (${Number(tx.amount)}): ` +
        `budgetId null -> ${budget.id} ("${budget.name}")`,
    );

    if (write) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { budgetId: budget.id },
      });
    }
  }

  console.log(`\n${changed} transaction(s) ${write ? 'updated' : 'would be updated'}, ${skipped} skipped.`);
  console.log('No spentAmount touched (current or historical) — as decided.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
