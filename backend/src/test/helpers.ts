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
