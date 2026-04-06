import type { DbPool } from '@aqsha-ai/database';

/**
 * Soft-deletes all non-deleted transactions for the user.
 * Returns the count of affected rows.
 */
export async function softDeleteAllTransactions(
  db: DbPool,
  userId: string,
): Promise<number> {
  const rows = await db<{ id: string }[]>`
    UPDATE public.transactions
       SET is_deleted   = true,
           deleted_at   = now(),
           parse_status = 'deleted'
     WHERE user_id   = ${userId}
       AND is_deleted = false
    RETURNING id
  `;
  return rows.length;
}
