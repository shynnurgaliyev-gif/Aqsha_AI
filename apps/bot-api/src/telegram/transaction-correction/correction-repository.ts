import type { DbPool } from '@aqsha-ai/database';

export interface CorrectionTransactionRow {
  id: string;
  kind: 'expense' | 'income';
  amount: number;
  categoryName: string;
  transactionDateLocal: string;
}

/**
 * Returns the most recent confirmed non-deleted transaction for the user,
 * or null if none exists.
 */
export async function findLastTransaction(
  db: DbPool,
  userId: string,
): Promise<CorrectionTransactionRow | null> {
  const rows = await db<{
    id: string;
    kind: string;
    amount: string;
    category_name: string;
    transaction_date_local: string;
  }[]>`
    SELECT t.id, t.kind, t.amount, c.name AS category_name, t.transaction_date_local::text
      FROM public.transactions t
      JOIN public.categories c ON c.id = t.category_id
     WHERE t.user_id = ${userId}
       AND t.is_deleted = false
       AND t.parse_status = 'confirmed'
     ORDER BY t.transaction_at DESC
     LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    kind: row.kind as 'expense' | 'income',
    amount: Number(row.amount),
    categoryName: row.category_name,
    transactionDateLocal: row.transaction_date_local,
  };
}

/**
 * Soft-deletes a transaction.
 * Sets is_deleted = true, deleted_at = now(), parse_status = 'deleted'.
 *
 * The user_id filter ensures a user can only delete their own transactions.
 * The is_deleted = false and parse_status = 'confirmed' guards prevent
 * double-deleting or deleting drafts.
 *
 * Returns true if a row was updated, false if the transaction was not found
 * (already deleted, wrong user, or wrong status).
 */
export async function softDeleteTransaction(
  db: DbPool,
  transactionId: string,
  userId: string,
): Promise<boolean> {
  const result = await db<{ id: string }[]>`
    UPDATE public.transactions
       SET is_deleted = true,
           deleted_at = now(),
           parse_status = 'deleted'
     WHERE id = ${transactionId}
       AND user_id = ${userId}
       AND is_deleted = false
       AND parse_status = 'confirmed'
    RETURNING id
  `;
  return result.length > 0;
}

/**
 * Returns the 5 most recent confirmed non-deleted transactions for the user.
 * Used in the correction context to show actionable entries.
 */
export async function queryRecentForCorrection(
  db: DbPool,
  userId: string,
): Promise<CorrectionTransactionRow[]> {
  const rows = await db<{
    id: string;
    kind: string;
    amount: string;
    category_name: string;
    transaction_date_local: string;
  }[]>`
    SELECT t.id, t.kind, t.amount, c.name AS category_name, t.transaction_date_local::text
      FROM public.transactions t
      JOIN public.categories c ON c.id = t.category_id
     WHERE t.user_id = ${userId}
       AND t.is_deleted = false
       AND t.parse_status = 'confirmed'
     ORDER BY t.transaction_at DESC
     LIMIT 5
  `;

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as 'expense' | 'income',
    amount: Number(r.amount),
    categoryName: r.category_name,
    transactionDateLocal: r.transaction_date_local,
  }));
}
