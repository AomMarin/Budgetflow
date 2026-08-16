export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: Role;
  currency: string;
  timezone: string;
  alertAt80: boolean;
  alertAt90: boolean;
  alertAt100: boolean;
  createdAt: string;
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  balance: number;
  currency: string;
  isDefault: boolean;
}

export type RolloverPolicy = 'RESET' | 'ROLLOVER' | 'SWEEP';

export interface Budget {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  usagePercent: number;
  alertLevel: '80' | '90' | '100' | null;
  isArchived: boolean;
  sortOrder: number;
  rolloverPolicy: RolloverPolicy;
  monthlyTarget: number | null;
  periodYear: number;
  periodMonth: number;
  createdAt: string;
}

export type TransactionType = 'INCOME' | 'EXPENSE';

// Present only when an EXPENSE borrowed overflow from a second budget — see
// backend TransactionSplit. Absent/empty for the overwhelming majority of
// transactions, which stay fully attributed to Transaction.budgetId.
export interface TransactionSplit {
  id: string;
  budgetId: string;
  amount: number;
  budget?: Pick<Budget, 'id' | 'name' | 'icon' | 'color'>;
}

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  budgetId?: string;
  amount: number;
  type: TransactionType;
  description: string;
  date: string;
  isImported: boolean;
  createdAt: string;
  budget?: Pick<Budget, 'id' | 'name' | 'icon' | 'color'>;
  splits?: TransactionSplit[];
}

export interface Transfer {
  id: string;
  userId: string;
  fromBudgetId: string;
  toBudgetId: string;
  amount: number;
  description?: string;
  createdAt: string;
  fromBudget: Pick<Budget, 'id' | 'name' | 'icon' | 'color'>;
  toBudget: Pick<Budget, 'id' | 'name' | 'icon' | 'color'>;
}

export interface ImportFile {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  rowCount: number;
  matchedCount: number;
  errorMessage?: string;
  processedAt?: string;
  createdAt: string;
}

export interface ImportRule {
  id: string;
  keyword: string;
  budgetId: string;
  priority: number;
  budget: Pick<Budget, 'id' | 'name' | 'icon' | 'color'>;
}

export interface DashboardData {
  totalBalance: number;
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  monthlyIncome: number;
  monthlyExpense: number;
  budgets: Budget[];
  recentTransactions: Transaction[];
  alerts: (Budget & { usagePercent: number })[];
}

export type NotificationType = 'BUDGET_ALERT' | 'RECURRING_PROCESSED';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: PaginationMeta;
}
