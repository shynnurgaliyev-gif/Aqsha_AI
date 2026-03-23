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
