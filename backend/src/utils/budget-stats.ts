export interface BudgetStats {
  remainingAmount: number;
  usagePercent: number;
  alertLevel: '80' | '90' | '100' | null;
}

// Shared by BudgetService.addStats() (live budgets) and the period-aware
// historical read (BudgetSession rows) — same formula, same rounding, same
// alert thresholds, so a budget's numbers never diverge depending on which
// source produced them.
export function computeBudgetStats(allocatedAmount: number, spentAmount: number): BudgetStats {
  const remaining = allocatedAmount - spentAmount;
  const usagePercent = allocatedAmount > 0 ? Math.round((spentAmount / allocatedAmount) * 100) : 0;

  let alertLevel: BudgetStats['alertLevel'] = null;
  if (usagePercent >= 100) alertLevel = '100';
  else if (usagePercent >= 90) alertLevel = '90';
  else if (usagePercent >= 80) alertLevel = '80';

  return { remainingAmount: remaining, usagePercent, alertLevel };
}
