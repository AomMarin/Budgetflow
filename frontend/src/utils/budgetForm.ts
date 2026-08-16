import { RolloverPolicy } from '@/types';

// Extracted from BudgetForm.tsx so the monthlyTarget rules can be unit
// tested — this project has no component-render test setup (jsdom/RTL),
// so pure logic like this is the testable surface for form behavior.

// monthlyTarget only means anything under RESET; other policies never read
// it, so the field is hidden for them (see BudgetForm.tsx).
export function shouldShowMonthlyTargetField(policy: RolloverPolicy): boolean {
  return policy === 'RESET';
}

export function isMonthlyTargetInvalid(policy: RolloverPolicy, monthlyTarget: string): boolean {
  if (!shouldShowMonthlyTargetField(policy)) return false;
  if (monthlyTarget.trim() === '') return false; // empty = fall back to allocatedAmount at close time
  const parsed = parseFloat(monthlyTarget);
  return isNaN(parsed) || parsed < 0;
}

// Empty string, or a policy where the field doesn't apply, both mean "no
// target set" -> backend falls back to allocatedAmount at close time.
export function resolveMonthlyTarget(policy: RolloverPolicy, monthlyTarget: string): number | null {
  if (!shouldShowMonthlyTargetField(policy)) return null;
  if (monthlyTarget.trim() === '') return null;
  return parseFloat(monthlyTarget);
}
