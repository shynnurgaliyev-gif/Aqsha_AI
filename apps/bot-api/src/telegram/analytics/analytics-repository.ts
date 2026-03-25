import type { DbPool } from '@aqsha-ai/database';
import type { AnalyticsPeriod } from './query-matcher';

export interface CategoryTotalRow {
  categoryName: string;
  total: number;
}

export interface RecentTransactionRow {
  kind: 'expense' | 'income';
  amount: number;
  categoryName: string;
  transactionDateLocal: string;
}

/**
 * Current balance = total confirmed income - total confirmed expense (all time).
 * Only confirmed, non-deleted transactions count.
 */
export async function queryBalance(db: DbPool, userId: string): Promise<number> {
  const rows = await db<{ balance: string }[]>`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0)
      AS balance
    FROM public.transactions
    WHERE user_id = ${userId}
      AND is_deleted = false
      AND parse_status = 'confirmed'
  `;
  return Number(rows[0]?.balance ?? 0);
}

/**
 * Total for the given kind in the current calendar month.
 * Uses transaction_date_local for month scoping (user's local date).
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
 * Total for the given kind within the given period.
 *
 * Period boundary notes:
 * - Boundaries use current_date (server date) as the reference point,
 *   consistent with queryMonthTotal. Per-user timezone support is not yet
 *   implemented (would require storing timezone in the DB).
 * - current_week: ISO week, Monday–Sunday (PostgreSQL date_trunc('week', ...)
 *   uses Monday as week start per ISO 8601).
 */
export async function queryPeriodTotal(
  db: DbPool,
  userId: string,
  kind: 'expense' | 'income',
  period: AnalyticsPeriod,
): Promise<number> {
  switch (period) {
    case 'current_month':
      return queryMonthTotal(db, userId, kind);

    case 'today': {
      const rows = await db<{ total: string }[]>`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM public.transactions
        WHERE user_id = ${userId}
          AND kind = ${kind}
          AND is_deleted = false
          AND parse_status = 'confirmed'
          AND transaction_date_local = current_date
      `;
      return Number(rows[0]?.total ?? 0);
    }

    case 'yesterday': {
      const rows = await db<{ total: string }[]>`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM public.transactions
        WHERE user_id = ${userId}
          AND kind = ${kind}
          AND is_deleted = false
          AND parse_status = 'confirmed'
          AND transaction_date_local = (current_date - interval '1 day')::date
      `;
      return Number(rows[0]?.total ?? 0);
    }

    case 'current_week': {
      const rows = await db<{ total: string }[]>`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM public.transactions
        WHERE user_id = ${userId}
          AND kind = ${kind}
          AND is_deleted = false
          AND parse_status = 'confirmed'
          AND transaction_date_local >= date_trunc('week', current_date)::date
          AND transaction_date_local < (date_trunc('week', current_date) + interval '1 week')::date
      `;
      return Number(rows[0]?.total ?? 0);
    }

    case 'previous_month': {
      const rows = await db<{ total: string }[]>`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM public.transactions
        WHERE user_id = ${userId}
          AND kind = ${kind}
          AND is_deleted = false
          AND parse_status = 'confirmed'
          AND transaction_date_local >= date_trunc('month', current_date - interval '1 month')::date
          AND transaction_date_local < date_trunc('month', current_date)::date
      `;
      return Number(rows[0]?.total ?? 0);
    }
  }
}

/**
 * Per-category totals for the given kind in the current calendar month.
 * Sorted by total descending, capped at 10 rows.
 */
export async function queryCategoryBreakdown(
  db: DbPool,
  userId: string,
  kind: 'expense' | 'income',
): Promise<CategoryTotalRow[]> {
  const rows = await db<{ category_name: string; total: string }[]>`
    SELECT c.name AS category_name, SUM(t.amount) AS total
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
  }));
}

/**
 * Per-category totals for the given kind within the given period.
 * Sorted by total descending, capped at 10 rows.
 * Delegates to queryCategoryBreakdown for current_month.
 */
export async function queryCategoryBreakdownByPeriod(
  db: DbPool,
  userId: string,
  kind: 'expense' | 'income',
  period: AnalyticsPeriod,
): Promise<CategoryTotalRow[]> {
  switch (period) {
    case 'current_month':
      return queryCategoryBreakdown(db, userId, kind);

    case 'today': {
      const rows = await db<{ category_name: string; total: string }[]>`
        SELECT c.name AS category_name, SUM(t.amount) AS total
        FROM public.transactions t
        JOIN public.categories c ON c.id = t.category_id
        WHERE t.user_id = ${userId}
          AND t.kind = ${kind}
          AND t.is_deleted = false
          AND t.parse_status = 'confirmed'
          AND t.transaction_date_local = current_date
        GROUP BY c.id, c.name
        ORDER BY total DESC
        LIMIT 10
      `;
      return rows.map((r) => ({ categoryName: r.category_name, total: Number(r.total) }));
    }

    case 'yesterday': {
      const rows = await db<{ category_name: string; total: string }[]>`
        SELECT c.name AS category_name, SUM(t.amount) AS total
        FROM public.transactions t
        JOIN public.categories c ON c.id = t.category_id
        WHERE t.user_id = ${userId}
          AND t.kind = ${kind}
          AND t.is_deleted = false
          AND t.parse_status = 'confirmed'
          AND t.transaction_date_local = (current_date - interval '1 day')::date
        GROUP BY c.id, c.name
        ORDER BY total DESC
        LIMIT 10
      `;
      return rows.map((r) => ({ categoryName: r.category_name, total: Number(r.total) }));
    }

    case 'current_week': {
      const rows = await db<{ category_name: string; total: string }[]>`
        SELECT c.name AS category_name, SUM(t.amount) AS total
        FROM public.transactions t
        JOIN public.categories c ON c.id = t.category_id
        WHERE t.user_id = ${userId}
          AND t.kind = ${kind}
          AND t.is_deleted = false
          AND t.parse_status = 'confirmed'
          AND t.transaction_date_local >= date_trunc('week', current_date)::date
          AND t.transaction_date_local < (date_trunc('week', current_date) + interval '1 week')::date
        GROUP BY c.id, c.name
        ORDER BY total DESC
        LIMIT 10
      `;
      return rows.map((r) => ({ categoryName: r.category_name, total: Number(r.total) }));
    }

    case 'previous_month': {
      const rows = await db<{ category_name: string; total: string }[]>`
        SELECT c.name AS category_name, SUM(t.amount) AS total
        FROM public.transactions t
        JOIN public.categories c ON c.id = t.category_id
        WHERE t.user_id = ${userId}
          AND t.kind = ${kind}
          AND t.is_deleted = false
          AND t.parse_status = 'confirmed'
          AND t.transaction_date_local >= date_trunc('month', current_date - interval '1 month')::date
          AND t.transaction_date_local < date_trunc('month', current_date)::date
        GROUP BY c.id, c.name
        ORDER BY total DESC
        LIMIT 10
      `;
      return rows.map((r) => ({ categoryName: r.category_name, total: Number(r.total) }));
    }
  }
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
