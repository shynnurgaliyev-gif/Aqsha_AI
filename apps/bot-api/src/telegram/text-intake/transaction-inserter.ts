import type { DbPool } from '@aqsha-ai/database';
import type { PendingTransactionDraft, BulkDraftItem } from './session-draft';

/**
 * Inserts a confirmed transaction into the transactions table.
 *
 * Only called after explicit user confirmation.
 * source_type = 'text', parse_status = 'confirmed'.
 * transaction_date_local is filled automatically by the
 * validate_transaction_category_and_fill_date trigger.
 * transaction_at defaults to now().
 */
export async function insertConfirmedTransaction(
  db: DbPool,
  userId: string,
  draft: PendingTransactionDraft,
): Promise<void> {
  await db`
    INSERT INTO transactions (
      user_id,
      category_id,
      kind,
      amount,
      source_type,
      source_raw_text,
      parse_status
    )
    VALUES (
      ${userId},
      ${draft.categoryId},
      ${draft.kind},
      ${draft.amount},
      'text',
      ${draft.rawText},
      'confirmed'
    )
  `;
}

/**
 * Inserts multiple confirmed transactions in a single query.
 * Used for bulk transaction intake after user confirmation.
 */
export async function insertConfirmedBulkTransactions(
  db: DbPool,
  userId: string,
  items: BulkDraftItem[],
): Promise<void> {
  if (items.length === 0) return;

  const values = items.map((item) => ({
    user_id: userId,
    category_id: item.categoryId,
    kind: item.kind,
    amount: item.amount,
    source_type: 'text' as const,
    source_raw_text: item.rawText,
    parse_status: 'confirmed' as const,
  }));

  await db`
    INSERT INTO transactions ${db(values, 'user_id', 'category_id', 'kind', 'amount', 'source_type', 'source_raw_text', 'parse_status')}
  `;
}
