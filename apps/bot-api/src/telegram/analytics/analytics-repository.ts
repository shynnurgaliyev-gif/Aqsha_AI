import type { DbPool } from '@aqsha-ai/database';
import { FALLBACK_TIMEZONE, type DateRange } from './period-resolver';

export interface CategoryTotalRow {
  categoryName: string;
  total: number;
  count: number;
}

export interface RecentTransactionRow {
  kind: 'expense' | 'income';
  amount: number;
  categoryName: string;
  transactionDateLocal: string;
}

/**
 * Reads the stored IANA timezone for the user.
 * Falls back to FALLBACK_TIMEZONE if the row is missing or the value is empty.
 * The users table column has the same default, so an empty/null value is
 * unexpected but handled defensively.
 */
export async function getUserTimezone(db: DbPool, userId: string): Promise<string> {
  const rows = await db<{ timezone: string }[]>`
    SELECT timezone FROM public.users WHERE id = ${userId}
  `;
  return rows[0]?.timezone || FALLBACK_TIMEZONE;
}

export interface BalanceSummary {
  balance: number;
  totalIncome: number;
  totalExpense: number;
}

/**
 * Returns all-time balance, total income, and total expense in one query.
 * Only confirmed, non-deleted transactions count.
 */
export async function queryBalance(db: DbPool, userId: string): Promise<BalanceSummary> {
  const rows = await db<{ total_income: string; total_expense: string }[]>`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0)  AS total_income,
      COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
    FROM public.transactions
    WHERE user_id    = ${userId}
      AND is_deleted  = false
      AND parse_status IN ('confirmed', 'corrected')
  `;
  const totalIncome  = Number(rows[0]?.total_income  ?? 0);
  const totalExpense = Number(rows[0]?.total_expense ?? 0);
  return { balance: totalIncome - totalExpense, totalIncome, totalExpense };
}

/**
 * Total for the given kind in the current calendar month.
 * Uses transaction_date_local for month scoping (user's local date).
 *
 * Note: this function still uses SQL current_date and is kept for reference.
 * New code should use queryPeriodTotal with an explicit DateRange resolved
 * from the user's timezone via resolvePeriodRange.
 */
export async function queryMonthTotal(
  db: DbPool,
  userId: string,
  kind: 'expense' | 'income',
): Promise<number> {
  const rows = await db<{ total: string }[]>`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM public.transactions
    WHERE user_id = ${userId}
      AND kind = ${kind}
      AND is_deleted = false
      AND parse_status = 'confirmed'
      AND transaction_date_local >= date_trunc('month', current_date)::date
      AND transaction_date_local < (date_trunc('month', current_date) + interval '1 month')::date
  `;
  return Number(rows[0]?.total ?? 0);
}

/**
 * Total for the given kind within an explicit date range.
 *
 * The range must be resolved in TypeScript via resolvePeriodRange before
 * calling this function. Using explicit date parameters instead of SQL
 * current_date ensures the query respects the user's local timezone.
 *
 * range.gte is inclusive, range.lt is exclusive (both YYYY-MM-DD).
 */
export async function queryPeriodTotal(
  db: DbPool,
  userId: string,
  kind: 'expense' | 'income',
  range: DateRange,
): Promise<number> {
  const rows = await db<{ total: string }[]>`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM public.transactions
    WHERE user_id = ${userId}
      AND kind = ${kind}
      AND is_deleted = false
      AND parse_status = 'confirmed'
      AND transaction_date_local >= ${range.gte}::date
      AND transaction_date_local < ${range.lt}::date
  `;
  return Number(rows[0]?.total ?? 0);
}

export interface CategoryScopedResult {
  total: number;
  count: number;
  categoryName: string;
}

/**
 * Returns total amount and transaction count for a specific category in a date range.
 * categoryId must be pre-resolved from user input via resolveCategory.
 */
export async function queryCategoryScopedTotal(
  db: DbPool,
  userId: string,
  kind: 'expense' | 'income',
  categoryId: string,
  range: DateRange,
): Promise<CategoryScopedResult | null> {
  const rows = await db<{ total: string; count: string; category_name: string }[]>`
    SELECT
      COALESCE(SUM(t.amount), 0) AS total,
      COUNT(*)::text              AS count,
      c.name                      AS category_name
    FROM public.transactions t
    JOIN public.categories c ON c.id = t.category_id
    WHERE t.user_id    = ${userId}
      AND t.kind       = ${kind}
      AND t.category_id = ${categoryId}::uuid
      AND t.is_deleted  = false
      AND t.parse_status IN ('confirmed', 'corrected')
      AND t.transaction_date_local >= ${range.gte}::date
      AND t.transaction_date_local <  ${range.lt}::date
    GROUP BY c.name
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    total: Number(row.total),
    count: Number(row.count),
    categoryName: row.category_name,
  };
}

/**
 * Per-category totals for the given kind in the current calendar month.
 * Sorted by total descending, capped at 10 rows.
 *
 * Note: this function still uses SQL current_date and is kept for reference.
 * New code should use queryCategoryBreakdownByPeriod with an explicit DateRange.
 */
export async function queryCategoryBreakdown(
  db: DbPool,
  userId: string,
  kind: 'expense' | 'income',
): Promise<CategoryTotalRow[]> {
  const rows = await db<{ category_name: string; total: string; count: string }[]>`
    SELECT c.name AS category_name, SUM(t.amount) AS total, COUNT(*) AS count
    FROM public.transactions t
    JOIN public.categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId}
      AND t.kind = ${kind}
      AND t.is_deleted = false
      AND t.parse_status = 'confirmed'
      AND t.transaction_date_local >= date_trunc('month', current_date)::date
      AND t.transaction_date_local < (date_trunc('month', current_date) + interval '1 month')::date
    GROUP BY c.id, c.name
    ORDER BY total DESC
    LIMIT 10
  `;
  return rows.map((r) => ({
    categoryName: r.category_name,
    total: Number(r.total),
    count: Number(r.count),
  }));
}

/**
 * Per-category totals for the given kind within an explicit date range.
 * Sorted by total descending, capped at 10 rows.
 *
 * The range must be resolved in TypeScript via resolvePeriodRange before
 * calling this function. Using explicit date parameters instead of SQL
 * current_date ensures the query respects the user's local timezone.
 *
 * range.gte is inclusive, range.lt is exclusive (both YYYY-MM-DD).
 */
export async function queryCategoryBreakdownByPeriod(
  db: DbPool,
  userId: string,
  kind: 'expense' | 'income',
  range: DateRange,
): Promise<CategoryTotalRow[]> {
  const rows = await db<{ category_name: string; total: string; count: string }[]>`
    SELECT c.name AS category_name, SUM(t.amount) AS total, COUNT(*) AS count
    FROM public.transactions t
    JOIN public.categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId}
      AND t.kind = ${kind}
      AND t.is_deleted = false
      AND t.parse_status = 'confirmed'
      AND t.transaction_date_local >= ${range.gte}::date
      AND t.transaction_date_local < ${range.lt}::date
    GROUP BY c.id, c.name
    ORDER BY total DESC
    LIMIT 10
  `;
  return rows.map((r) => ({
    categoryName: r.category_name,
    total: Number(r.total),
    count: Number(r.count),
  }));
}

/**
 * Most recent 5 confirmed non-deleted transactions for the user.
 * Period-agnostic: always returns the 5 most recent regardless of period.
 */
export async function queryRecentTransactions(
  db: DbPool,
  userId: string,
): Promise<RecentTransactionRow[]> {
  const rows = await db<{
    kind: string;
    amount: string;
    category_name: string;
    transaction_date_local: string;
  }[]>`
    SELECT
      t.kind,
      t.amount,
      c.name AS category_name,
      t.transaction_date_local::text
    FROM public.transactions t
    JOIN public.categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId}
      AND t.is_deleted = false
      AND t.parse_status = 'confirmed'
    ORDER BY t.transaction_at DESC
    LIMIT 5
  `;
  return rows.map((r) => ({
    kind: r.kind as 'expense' | 'income',
    amount: Number(r.amount),
    categoryName: r.category_name,
    transactionDateLocal: r.transaction_date_local,
  }));
}
