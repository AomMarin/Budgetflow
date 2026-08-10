import { randomUUID } from 'crypto';
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
