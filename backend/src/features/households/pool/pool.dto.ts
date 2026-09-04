export interface ContributeDto {
  amount: number;
  fromAccountId: string;
  // Required — see pool.validation.ts: an unearmarked contribution decrements
  // fromAccountId's balance without touching any budget's spentAmount, which
  // let Sigma(remaining) silently exceed Sigma(balance) with no check
  // catching it (the mindmint@budgetflow.app incident this closes).
  fromBudgetId: string;
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
