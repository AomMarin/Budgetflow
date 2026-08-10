import { describe, expect, it } from 'vitest';
import { calculateAllocationTotals } from '../allocation';

describe('calculateAllocationTotals', () => {
  it('computes totals for a normal set of budgets', () => {
    const budgets = [
      { allocatedAmount: 500, spentAmount: 200 },
      { allocatedAmount: 300, spentAmount: 100 },
    ];
    const result = calculateAllocationTotals(budgets, 1000);

    expect(result.totalAllocated).toBe(800);
    expect(result.totalSpent).toBe(300);
    expect(result.totalRemaining).toBe(500); // 800 - 300
    expect(result.availableToAllocate).toBe(500); // 1000 - 500
  });

  it('excludes the currently-edited budget via currentAllocation so its own amount can be replaced', () => {
    const budgets = [
      { allocatedAmount: 500, spentAmount: 200 }, // the budget being edited
      { allocatedAmount: 300, spentAmount: 100 },
    ];
    // Editing the first budget: its existing 500 allocatedAmount is added back
    // so the form doesn't count it against itself.
    const result = calculateAllocationTotals(budgets, 1000, 500);

    expect(result.availableToAllocate).toBe(1000); // 1000 - 500 + 500
  });

  it('a budget with allocatedAmount below spentAmount pulls totalRemaining negative (unfloored, matches backend pre-guard behavior)', () => {
    const budgets = [{ allocatedAmount: 100, spentAmount: 400 }];
    const result = calculateAllocationTotals(budgets, 600);

    expect(result.totalRemaining).toBe(-300);
    expect(result.availableToAllocate).toBe(900); // 600 - (-300)
  });

  it('returns zeroed totals for an empty budget list', () => {
    const result = calculateAllocationTotals([], 1000);

    expect(result.totalAllocated).toBe(0);
    expect(result.totalSpent).toBe(0);
    expect(result.totalRemaining).toBe(0);
    expect(result.availableToAllocate).toBe(1000);
  });
});
