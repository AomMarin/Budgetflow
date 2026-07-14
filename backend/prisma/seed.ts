import { PrismaClient, TransactionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('Password123!', 12);

  const user = await prisma.user.upsert({
    where: { email: 'demo@budgetflow.app' },
    update: { role: 'ADMIN' },
    create: {
      email: 'demo@budgetflow.app',
      password: hashedPassword,
      name: 'Demo User',
      currency: 'THB',
      role: 'ADMIN',
    },
  });

  const account = await prisma.account.upsert({
    where: { id: 'demo-account-id' },
    update: {},
    create: {
      id: 'demo-account-id',
      userId: user.id,
      name: 'Main Account',
      balance: 30000,
      isDefault: true,
    },
  });

  const budgetData = [
    { name: 'Food & Dining', icon: '🍔', color: '#EF4444', allocatedAmount: 6000 },
    { name: 'Transport', icon: '🚗', color: '#F59E0B', allocatedAmount: 2000 },
    { name: 'Shopping', icon: '🛍️', color: '#8B5CF6', allocatedAmount: 3000 },
    { name: 'Entertainment', icon: '🎬', color: '#EC4899', allocatedAmount: 2000 },
    { name: 'Savings', icon: '💰', color: '#10B981', allocatedAmount: 10000 },
    { name: 'Emergency Fund', icon: '🆘', color: '#3B82F6', allocatedAmount: 5000 },
    { name: 'Utilities', icon: '💡', color: '#6366F1', allocatedAmount: 2000 },
  ];

  const budgets = [];
  for (const b of budgetData) {
    const budget = await prisma.budget.create({
      data: { userId: user.id, ...b, sortOrder: budgetData.indexOf(b) },
    });
    budgets.push(budget);
  }

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

  console.log('✅ Seed completed');
  console.log(`   Demo user: demo@budgetflow.app / Password123!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
