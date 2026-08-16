import { describe, expect, it } from 'vitest';
import { shouldShowMonthlyTargetField, isMonthlyTargetInvalid, resolveMonthlyTarget } from '../budgetForm';

describe('shouldShowMonthlyTargetField', () => {
  it('shows only for RESET', () => {
    expect(shouldShowMonthlyTargetField('RESET')).toBe(true);
    expect(shouldShowMonthlyTargetField('SWEEP')).toBe(false);
    expect(shouldShowMonthlyTargetField('ROLLOVER')).toBe(false);
  });
});

describe('isMonthlyTargetInvalid', () => {
  it('is never invalid for a policy where the field is hidden, regardless of content', () => {
    expect(isMonthlyTargetInvalid('SWEEP', '-500')).toBe(false);
    expect(isMonthlyTargetInvalid('ROLLOVER', 'not a number')).toBe(false);
  });

  it('treats an empty value as valid under RESET (falls back to allocatedAmount)', () => {
    expect(isMonthlyTargetInvalid('RESET', '')).toBe(false);
    expect(isMonthlyTargetInvalid('RESET', '   ')).toBe(false);
  });

  it('rejects negative or non-numeric values under RESET', () => {
    expect(isMonthlyTargetInvalid('RESET', '-1')).toBe(true);
    expect(isMonthlyTargetInvalid('RESET', 'abc')).toBe(true);
  });

  it('accepts a non-negative number under RESET', () => {
    expect(isMonthlyTargetInvalid('RESET', '0')).toBe(false);
    expect(isMonthlyTargetInvalid('RESET', '6000')).toBe(false);
  });
});

describe('resolveMonthlyTarget', () => {
  it('resolves to null for any non-RESET policy even if a value is typed in', () => {
    expect(resolveMonthlyTarget('SWEEP', '6000')).toBeNull();
    expect(resolveMonthlyTarget('ROLLOVER', '6000')).toBeNull();
  });

  it('resolves to null under RESET when left empty', () => {
    expect(resolveMonthlyTarget('RESET', '')).toBeNull();
  });

  it('resolves to the parsed number under RESET', () => {
    expect(resolveMonthlyTarget('RESET', '6000')).toBe(6000);
    expect(resolveMonthlyTarget('RESET', '1500.50')).toBe(1500.5);
  });
});
