import { describe, expect, it } from 'vitest';
import {
  isValidBudgetAmount,
  isValidBudget,
  relaxBudgetForRetry,
  formatBudgetLabel,
  BUDGET_MIN_USD,
  BUDGET_MAX_USD,
  BUDGET_STEP_USD,
} from './budget.js';

describe('budget', () => {
  it('accepts the range endpoints', () => {
    expect(isValidBudgetAmount(BUDGET_MIN_USD)).toBe(true);
    expect(isValidBudgetAmount(BUDGET_MAX_USD)).toBe(true);
  });

  it('accepts every step in between', () => {
    for (let v = BUDGET_MIN_USD; v <= BUDGET_MAX_USD; v += BUDGET_STEP_USD) {
      expect(isValidBudgetAmount(v), `$${String(v)} should be a valid step`).toBe(true);
    }
  });

  it('rejects values outside the range', () => {
    expect(isValidBudgetAmount(BUDGET_MIN_USD - 5)).toBe(false);
    expect(isValidBudgetAmount(BUDGET_MAX_USD + 5)).toBe(false);
  });

  it('rejects values that are not on a step boundary', () => {
    expect(isValidBudgetAmount(12)).toBe(false);
    expect(isValidBudgetAmount(101)).toBe(false);
  });

  it('treats a flexible budget as valid only with no amount attached', () => {
    expect(isValidBudget({ mode: 'flex' })).toBe(true);
    expect(isValidBudget({ mode: 'flex', amountUsd: 50 })).toBe(false);
  });

  it('treats a fixed budget as valid only with a valid amount attached', () => {
    expect(isValidBudget({ mode: 'fixed', amountUsd: 50 })).toBe(true);
    expect(isValidBudget({ mode: 'fixed' })).toBe(false);
    expect(isValidBudget({ mode: 'fixed', amountUsd: 51 })).toBe(false);
  });

  it('always relaxes a retry to flexible, per the expired-screen copy', () => {
    expect(relaxBudgetForRetry()).toEqual({ mode: 'flex' });
  });

  it('formats the two budget modes as the handoff copy expects', () => {
    expect(formatBudgetLabel({ mode: 'flex' })).toBe('Flexible');
    expect(formatBudgetLabel({ mode: 'fixed', amountUsd: 30 })).toBe('Up to $30');
  });
});
