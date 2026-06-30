import { TransactionType } from '@prisma/client';

export interface CreateTransactionDto {
  accountId: string;
  budgetId?: string;
  amount: number;
  type: TransactionType;
  description: string;
  date: string;
}

export interface UpdateTransactionDto {
  budgetId?: string | null;
  amount?: number;
  type?: TransactionType;
  description?: string;
  date?: string;
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
