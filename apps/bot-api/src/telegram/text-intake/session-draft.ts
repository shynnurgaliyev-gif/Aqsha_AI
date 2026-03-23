import type { DbPool } from '@aqsha-ai/database';
import type { IntakeKind } from './parser';

/**
 * Pending transaction draft stored inside user_sessions.context_json.
 * Key: "pendingTransaction"
 */
export interface PendingTransactionDraft {
  kind: IntakeKind;
  amount: number;
  categoryId: string;
  categoryName: string;
  rawText: string;
}

/**
 * Reads the pending transaction draft from the session context.
 * Returns null if no session row exists or no draft is present.
 */
export async function getPendingDraft(
  db: DbPool,
  userId: string,
): Promise<PendingTransactionDraft | null> {
  const result = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = result[0];
  if (!row) return null;

  const draft = row.context_json['pendingTransaction'];
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;

  return draft as PendingTransactionDraft;
}

/**
 * Stores a pending transaction draft in the session context.
 * Uses JSONB || merge so other context_json keys are preserved.
 * Sets session_status to 'awaiting_confirmation'.
 */
export async function setPendingDraft(
  db: DbPool,
  userId: string,
  draft: PendingTransactionDraft,
): Promise<void> {
  await db`
    UPDATE user_sessions
    SET
      context_json         = context_json || ${db.json({ pendingTransaction: draft } as any)},
      session_status       = 'awaiting_confirmation',
      last_user_message_at = now()
    WHERE user_id = ${userId}
  `;
}

/**
 * Removes the pending transaction draft from the session context.
 * Uses JSONB - operator to remove only the pendingTransaction key.
 * Resets session_status to 'idle'.
 */
export async function clearPendingDraft(db: DbPool, userId: string): Promise<void> {
  await db`
    UPDATE user_sessions
    SET
      context_json         = context_json - 'pendingTransaction',
      session_status       = 'idle',
      last_user_message_at = now()
    WHERE user_id = ${userId}
  `;
}
