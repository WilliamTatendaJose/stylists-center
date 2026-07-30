/**
 * New-request budget (SRS §3.3, handoff screen 2): either flexible, or a
 * fixed "up to $NN" amount on a 10-120 step-5 slider. A retry after a failed
 * match always resets to flexible — the server enforces this on
 * `/matches/:id/retry` and must reject a retry payload that disagrees, so the
 * client's attempt/budget state can never diverge from what actually happened.
 */
export type BudgetMode = 'flex' | 'fixed';

export const BUDGET_MIN_USD = 10;
export const BUDGET_MAX_USD = 120;
export const BUDGET_STEP_USD = 5;

export interface Budget {
  mode: BudgetMode;
  /** USD, only meaningful when mode is 'fixed'. */
  amountUsd?: number;
}

export function isValidBudgetAmount(amountUsd: number): boolean {
  if (amountUsd < BUDGET_MIN_USD || amountUsd > BUDGET_MAX_USD) return false;
  return (amountUsd - BUDGET_MIN_USD) % BUDGET_STEP_USD === 0;
}

export function isValidBudget(budget: Budget): boolean {
  if (budget.mode === 'flex') return budget.amountUsd === undefined;
  return budget.amountUsd !== undefined && isValidBudgetAmount(budget.amountUsd);
}

/** Every retry relaxes the budget to flexible, per the handoff's expired screen. */
export function relaxBudgetForRetry(): Budget {
  return { mode: 'flex' };
}

export function formatBudgetLabel(budget: Budget): string {
  return budget.mode === 'flex' ? 'Flexible' : `Up to $${String(budget.amountUsd)}`;
}
