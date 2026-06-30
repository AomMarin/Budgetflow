export interface CreateRecurringDto {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  dayOfMonth: number;
  accountId: string;
  budgetId?: string;
  description?: string;
}

export interface UpdateRecurringDto {
  name?: string;
  amount?: number;
  dayOfMonth?: number;
  accountId?: string;
  budgetId?: string | null;
  description?: string;
  isActive?: boolean;
}
