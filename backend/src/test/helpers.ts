import { randomUUID } from 'crypto';
import { expect } from 'vitest';
import { prisma } from '../config/database';
import { hashPassword } from '../utils/password';

export interface TestUserContext {
  userId: string;
  accountId: string;
  email: string;
}

// Every test user gets a "test-" prefixed @budgetflow.test email and its own
// account, so tests never read or write another user's data — all service
// calls in the suites are scoped to this userId.
export async function createTestUser(initialBalance = 0): Promise<TestUserContext> {
  const email = `test-${randomUUID()}@budgetflow.test`;
  const user = await prisma.user.create({
    data: {
      email,
      password: await hashPassword('Test123!'),
      name: 'Test User',
    },
  });
  const account = await prisma.account.create({
    data: { userId: user.id, name: 'Test Account', balance: initialBalance, isDefault: true },
  });
  return { userId: user.id, accountId: account.id, email };
}

// Cascades (see schema.prisma User relations) delete the user's accounts,
// budgets, transactions, allocations, etc. along with the user row.
export async function cleanupTestUser(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

// Zero-based budgeting's core invariant, checked directly against the DB
// rather than through any service — Sigma(remaining) must never exceed
// Sigma(balance). Every monthly-close test (RESET/ROLLOVER/SWEEP) must call
// this after closing, since a broken close formula is exactly the kind of
// bug that produces money out of thin air (see CLAUDE.md Phase 3 design
// notes on the RESET/ROLLOVER bug this replaced).
export async function assertZeroBasedInvariant(userId: string): Promise<void> {
  const [budgets, accountAgg] = await Promise.all([
    prisma.budget.findMany({ where: { userId, isArchived: false } }),
    prisma.account.aggregate({ where: { userId }, _sum: { balance: true } }),
  ]);
  const totalBalance = Number(accountAgg._sum.balance ?? 0);
  const totalRemaining = budgets.reduce(
    (sum, b) => sum + Math.max(Number(b.allocatedAmount) - Number(b.spentAmount), 0),
    0,
  );
  // Tiny epsilon for Decimal->Number float round-trip, not a real allowance.
  expect(totalRemaining).toBeLessThanOrEqual(totalBalance + 0.001);
}

// Phase A of the session-based budget model (see
// C:\Users\ammar\.claude\plans\kind-dancing-sparrow.md): BudgetSession is a
// live mirror of Budget's own allocatedAmount/spentAmount/periodYear/
// periodMonth, kept in sync by mirrorSessionAmount() at every write site.
// Nothing reads BudgetSession yet, so this is the only thing that would
// catch a missed mirror call — every test exercising a write path covered by
// that migration should call this alongside assertZeroBasedInvariant.
export async function assertSessionMirror(userId: string): Promise<void> {
  const budgets = await prisma.budget.findMany({ where: { userId, isArchived: false } });
  for (const budget of budgets) {
    const openSessions = await prisma.budgetSession.findMany({
      where: { budgetId: budget.id, status: 'OPEN' },
    });
    expect(openSessions, `budget ${budget.id} ("${budget.name}") has no OPEN session`).toHaveLength(1);
    const session = openSessions[0];
    expect(Number(session.allocatedAmount), `budget ${budget.id} allocatedAmount mirror mismatch`).toBe(
      Number(budget.allocatedAmount),
    );
    expect(Number(session.spentAmount), `budget ${budget.id} spentAmount mirror mismatch`).toBe(
      Number(budget.spentAmount),
    );
    expect(session.periodYear, `budget ${budget.id} periodYear mirror mismatch`).toBe(budget.periodYear);
    expect(session.periodMonth, `budget ${budget.id} periodMonth mirror mismatch`).toBe(budget.periodMonth);
  }
}
