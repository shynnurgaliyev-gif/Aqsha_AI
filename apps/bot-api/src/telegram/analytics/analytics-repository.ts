import type { DbPool } from '@aqsha-ai/database';

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
 * Current balance = total confirmed income - total confirmed expense.
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
 * Total for the given kind (expense or income) in the current calendar month.
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
 * Most recent 5 confirmed non-deleted transactions for the user.
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
