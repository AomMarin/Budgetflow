interface BudgetLike {
  allocatedAmount: number;
  spentAmount: number;
}

export interface AllocationTotals {
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
  availableToAllocate: number;
}

// Use totalRemaining (unspent earmarks), not totalAllocated: spent money
// already left the account balance, so allocatedAmount alone double-counts
// it against balance. Do not revert to totalAllocated.
// currentAllocation excludes the budget being edited from totalRemaining so
// its own allocatedAmount can be replaced by the value in the form.
export function calculateAllocationTotals(
  budgets: BudgetLike[],
  totalBalance: number,
  currentAllocation = 0,
): AllocationTotals {
  const totalAllocated = budgets.reduce((s, b) => s + Number(b.allocatedAmount), 0);
  const totalSpent = budgets.reduce((s, b) => s + Number(b.spentAmount), 0);
  const totalRemaining = totalAllocated - totalSpent;
  const availableToAllocate = totalBalance - totalRemaining + currentAllocation;
  return { totalAllocated, totalSpent, totalRemaining, availableToAllocate };
}
