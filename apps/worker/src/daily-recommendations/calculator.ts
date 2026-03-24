/**
 * Returns the number of calendar days remaining in the month, including today.
 * Input: 'YYYY-MM-DD' string.
 */
export function calculateDaysRemaining(todayLocalDate: string): number {
  const parts = todayLocalDate.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  // new Date(year, month, 0) gives the last day of the month (month is 1-based here)
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth - day + 1;
}

export type BudgetSignalKind = 'on_track' | 'near_limit' | 'over_budget';

export interface BudgetSignal {
  categoryName: string;
  kind: BudgetSignalKind;
  budgetAmount: number;
  spent: number;
  remaining: number;
}

/** Threshold at which a budget is considered near its limit (80% spent). */
const NEAR_LIMIT_RATIO = 0.8;

/**
 * Classifies each budget entry as on_track, near_limit, or over_budget.
 * Returns a signal for every budget row — callers filter by kind as needed.
 */
export function selectBudgetSignals(
  budgets: Array<{ categoryName: string; budgetAmount: number; spent: number; remaining: number }>,
): BudgetSignal[] {
  return budgets.map((b) => {
    let kind: BudgetSignalKind;
    if (b.remaining < 0) {
      kind = 'over_budget';
    } else if (b.budgetAmount > 0 && b.spent / b.budgetAmount >= NEAR_LIMIT_RATIO) {
      kind = 'near_limit';
    } else {
      kind = 'on_track';
    }
    return { categoryName: b.categoryName, kind, budgetAmount: b.budgetAmount, spent: b.spent, remaining: b.remaining };
  });
}

/**
 * Returns the recommended maximum daily spend for the remainder of the month.
 * Uses integer floor division — no float arithmetic.
 *
 * If balance is zero or negative, returns 0 (nothing left to spend).
 * daysRemaining is clamped to a minimum of 1 to avoid division by zero.
 */
export function calculateSafeDailySpend(balance: number, daysRemaining: number): number {
  if (balance <= 0) return 0;
  return Math.floor(balance / Math.max(daysRemaining, 1));
}
