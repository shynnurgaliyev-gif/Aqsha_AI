import type { DbPool } from '@aqsha-ai/database';

export interface ReceiptInsertData {
  updateId: number;
  telegramUserId: number | null;
  chatId: number | null;
  updateType: string;
  payloadJson: unknown;
}

/**
 * Inserts a new receipt row for the given update_id.
 * Uses ON CONFLICT DO NOTHING for idempotent deduplication.
 *
 * Returns true if the row was newly inserted (first time seeing this update_id).
 * Returns false if a row already existed (duplicate — skip processing).
 */
export async function insertOrIgnoreReceipt(
  db: DbPool,
  data: ReceiptInsertData,
): Promise<boolean> {
  const result = await db`
    INSERT INTO telegram_update_receipts (
      update_id,
      telegram_user_id,
      chat_id,
      update_type,
      payload_json,
      status
    )
    VALUES (
      ${data.updateId},
      ${data.telegramUserId},
      ${data.chatId},
      ${data.updateType},
      ${db.json(data.payloadJson as any)},
      'received'
    )
    ON CONFLICT (update_id) DO NOTHING
    RETURNING update_id
  `;
  return result.length > 0;
}

/**
 * Marks an existing receipt as successfully processed.
 */
export async function markReceiptProcessed(db: DbPool, updateId: number): Promise<void> {
  await db`
    UPDATE telegram_update_receipts
    SET status = 'processed', processed_at = now()
    WHERE update_id = ${updateId}
  `;
}

/**
 * Marks an existing receipt as failed and stores the error text.
 */
export async function markReceiptFailed(
  db: DbPool,
  updateId: number,
  errorText: string,
): Promise<void> {
  await db`
    UPDATE telegram_update_receipts
    SET status = 'failed', error_text = ${errorText}
    WHERE update_id = ${updateId}
  `;
}
