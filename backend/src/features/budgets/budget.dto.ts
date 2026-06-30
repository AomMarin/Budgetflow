export interface CreateBudgetDto {
  name: string;
  icon: string;
  color: string;
  allocatedAmount: number;
}

export interface UpdateBudgetDto {
  name?: string;
  icon?: string;
  color?: string;
  allocatedAmount?: number;
  sortOrder?: number;
}

export interface AllocateIncomeDto {
  accountId: string;
  totalAmount: number;
  allocations: {
    budgetId: string;
    amount: number;
  }[];
  note?: string;
}
