export interface ContributeDto {
  amount: number;
  fromAccountId: string;
  fromBudgetId?: string;
  description?: string;
}

export interface SpendDto {
  budgetId?: string;
  amount: number;
  description: string;
  date: string;
}

export interface UpdatePoolTransactionDto {
  budgetId?: string | null;
  amount?: number;
  description?: string;
  date?: string;
}
