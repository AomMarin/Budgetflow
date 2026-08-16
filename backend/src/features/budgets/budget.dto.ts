import { RolloverPolicy } from '@prisma/client';

export interface CreateBudgetDto {
  name: string;
  icon: string;
  color: string;
  allocatedAmount: number;
  rolloverPolicy?: RolloverPolicy;
  monthlyTarget?: number | null;
}

export interface UpdateBudgetDto {
  name?: string;
  icon?: string;
  color?: string;
  allocatedAmount?: number;
  sortOrder?: number;
  rolloverPolicy?: RolloverPolicy;
  monthlyTarget?: number | null;
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
