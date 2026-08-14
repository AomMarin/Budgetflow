import { TransactionType } from '@prisma/client';

export interface CreateTransactionDto {
  accountId: string;
  budgetId?: string;
  amount: number;
  type: TransactionType;
  description: string;
  date: string;
  // Borrow overflow (amount beyond budgetId's own remaining) from this
  // second budget instead of blocking the expense. Ignored for non-EXPENSE.
  borrowFromBudgetId?: string;
}

export interface UpdateTransactionDto {
  budgetId?: string | null;
  amount?: number;
  type?: TransactionType;
  description?: string;
  date?: string;
  // Always recomputed fresh from this value on edit — never inherited from
  // the transaction's prior borrow, since the prior borrow was sized against
  // the old amount/budget combination. Omit to mean "no borrow" in the new state.
  borrowFromBudgetId?: string | null;
}

export interface TransactionFilters {
  type?: TransactionType;
  budgetId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}
