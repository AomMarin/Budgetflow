import { PrismaClient, TransactionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Fallback only matters the first time this seed ever runs in an
// environment (see seedAdmin below) — set SEED_ADMIN_PASSWORD for anything
// that isn't a throwaway local/test database.
const FALLBACK_ADMIN_PASSWORD = 'Bf-Adm1n-Change-Me-2026!';

const budgetData = [
  { name: 'Food & Dining', icon: '🍔', color: '#EF4444', allocatedAmount: 6000 },
  { name: 'Transport', icon: '🚗', color: '#F59E0B', allocatedAmount: 2000 },
  { name: 'Shopping', icon: '🛍️', color: '#8B5CF6', allocatedAmount: 3000 },
  { name: 'Entertainment', icon: '🎬', color: '#EC4899', allocatedAmount: 2000 },
  { name: 'Savings', icon: '💰', color: '#10B981', allocatedAmount: 10000 },
  { name: 'Emergency Fund', icon: '🆘', color: '#3B82F6', allocatedAmount: 5000 },
  { name: 'Utilities', icon: '💡', color: '#6366F1', allocatedAmount: 2000 },
];

const defaultRules = [
  { keyword: 'KFC', budgetIndex: 0 },
  { keyword: 'McDonald', budgetIndex: 0 },
  { keyword: 'Grab Food', budgetIndex: 0 },
  { keyword: 'Grab', budgetIndex: 1 },
  { keyword: 'Bolt', budgetIndex: 1 },
  { keyword: 'BTS', budgetIndex: 1 },
  { keyword: 'Steam', budgetIndex: 3 },
  { keyword: 'Netflix', budgetIndex: 3 },
  { keyword: 'Spotify', budgetIndex: 3 },
  { keyword: 'Lazada', budgetIndex: 2 },
  { keyword: 'Shopee', budgetIndex: 2 },
  { keyword: '7-11', budgetIndex: 0 },
  { keyword: 'Electricity', budgetIndex: 6 },
  { keyword: 'Water', budgetIndex: 6 },
  { keyword: 'Internet', budgetIndex: 6 },
];

// Real, privately-used account — never printed to console, never shown in
// the UI. Not linked from any public page; kept out of LoginPage's hint.
async function seedAdmin() {
  const user = await prisma.user.upsert({
    where: { email: 'admin@budgetflow.app' },
    update: { role: 'ADMIN' },
    // password is set on create only — re-running this seed against an
    // environment where the admin already exists (production) must never
    // silently overwrite a password that's since been changed via the
    // app's own Settings > Change Password flow.
    create: {
      email: 'admin@budgetflow.app',
      password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? FALLBACK_ADMIN_PASSWORD, 12),
      name: 'Admin',
      currency: 'THB',
      role: 'ADMIN',
    },
  });

  // findFirst-or-create instead of upsert-by-fixed-id: a fixed account id
  // with an empty `update: {}` is exactly what silently orphaned this
  // account from its user on a previous reseed (see DEPLOYMENT.md) — this
  // always resolves the real existing account for this user instead.
  const account =
    (await prisma.account.findFirst({ where: { userId: user.id, isDefault: true } })) ??
    (await prisma.account.create({
      data: { userId: user.id, name: 'Main Account', balance: 30000, isDefault: true },
    }));

  const budgets = [];
  for (let i = 0; i < budgetData.length; i++) {
    const b = budgetData[i];
    const budget =
      (await prisma.budget.findFirst({ where: { userId: user.id, name: b.name } })) ??
      (await prisma.budget.create({ data: { userId: user.id, ...b, sortOrder: i } }));
    budgets.push(budget);
  }

  for (let i = 0; i < defaultRules.length; i++) {
    const rule = defaultRules[i];
    await prisma.importRule.upsert({
      where: { userId_keyword: { userId: user.id, keyword: rule.keyword } },
      update: { budgetId: budgets[rule.budgetIndex].id, priority: i },
      create: {
        userId: user.id,
        keyword: rule.keyword,
        budgetId: budgets[rule.budgetIndex].id,
        priority: i,
      },
    });
  }

  return { user, account, budgets };
}

// Public-facing account advertised on the login page. USER role only, fixed
// password (intentionally public) — must never gain admin data-access.
async function seedDemo() {
  // Unlike admin's password, this one is intentionally public and fixed —
  // it must always match what LoginPage's hint advertises, so both role
  // and password are enforced on every run, not just on first create. This
  // also self-heals a leftover pre-2d3dfef demo@ row from before the
  // account was reseeded to admin@ (see DEPLOYMENT.md): if that legacy row
  // still exists in production with a stale password or role, this pulls
  // it back in line instead of silently leaving it as-is.
  const demoPassword = await bcrypt.hash('Password123!', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@budgetflow.app' },
    update: { password: demoPassword, role: 'USER', name: 'Demo User' },
    create: {
      email: 'demo@budgetflow.app',
      password: demoPassword,
      name: 'Demo User',
      currency: 'THB',
      role: 'USER',
    },
  });

  const startingBalance = 15000;
  const account =
    (await prisma.account.findFirst({ where: { userId: user.id, isDefault: true } })) ??
    (await prisma.account.create({
      data: { userId: user.id, name: 'Main Account', balance: startingBalance, isDefault: true },
    }));

  const demoBudgetData = [
    { name: 'Food & Dining', icon: '🍔', color: '#EF4444', allocatedAmount: 4000 },
    { name: 'Transport', icon: '🚗', color: '#F59E0B', allocatedAmount: 1500 },
    { name: 'Shopping', icon: '🛍️', color: '#8B5CF6', allocatedAmount: 2000 },
    { name: 'Entertainment', icon: '🎬', color: '#EC4899', allocatedAmount: 1000 },
  ];

  const budgets = [];
  for (let i = 0; i < demoBudgetData.length; i++) {
    const b = demoBudgetData[i];
    const budget =
      (await prisma.budget.findFirst({ where: { userId: user.id, name: b.name } })) ??
      (await prisma.budget.create({ data: { userId: user.id, ...b, sortOrder: i } }));
    budgets.push(budget);
  }

  // Skip entirely on re-runs: these transactions (and the balance/spentAmount
  // they imply) are only ever created once, so re-seeding an environment
  // that already has demo data doesn't double-apply the side effects below.
  const alreadyHasTransactions = await prisma.transaction.findFirst({ where: { userId: user.id } });
  if (alreadyHasTransactions) {
    return { user, account, budgets };
  }

  const [food, transport, shopping] = budgets;
  const sampleExpenses = [
    { budget: food, amount: 350, description: 'KFC lunch', daysAgo: 1 },
    { budget: food, amount: 180, description: '7-11 snacks', daysAgo: 3 },
    { budget: transport, amount: 120, description: 'Grab ride', daysAgo: 2 },
    { budget: shopping, amount: 890, description: 'Lazada order', daysAgo: 5 },
  ];
  const sampleIncome = { amount: 25000, description: 'Salary' };

  // Bypasses TransactionService (no side effects fire from a raw
  // prisma.transaction.create), so balance/spentAmount are updated here by
  // hand to match — otherwise the demo dashboard would show transactions
  // that don't add up to the account/budget totals.
  let totalExpense = 0;
  for (const tx of sampleExpenses) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        budgetId: tx.budget.id,
        type: TransactionType.EXPENSE,
        amount: tx.amount,
        description: tx.description,
        date: new Date(Date.now() - tx.daysAgo * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.budget.update({ where: { id: tx.budget.id }, data: { spentAmount: { increment: tx.amount } } });
    totalExpense += tx.amount;
  }

  await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: account.id,
      type: TransactionType.INCOME,
      amount: sampleIncome.amount,
      description: sampleIncome.description,
      date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.account.update({
    where: { id: account.id },
    data: { balance: { increment: sampleIncome.amount - totalExpense } },
  });

  return { user, account, budgets };
}

async function main() {
  await seedAdmin();
  await seedDemo();

  console.log('✅ Seed completed');
  console.log('   Demo user (public): demo@budgetflow.app / Password123!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
