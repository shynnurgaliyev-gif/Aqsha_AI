import type { DbPool } from '@aqsha-ai/database';

/**
 * Pending correction state stored in user_sessions.context_json under key "pendingCorrection".
 *
 * 'field' indicates what is being corrected.
 * For 'amount': newAmount is set; newCategoryId/newCategoryName are absent.
 * For 'category': newCategoryId and newCategoryName are set; newAmount is absent.
 */
export interface PendingCorrectionState {
  transactionId: string;
  kind: 'expense' | 'income';
  currentAmount: number;
  currentCategoryName: string;
  transactionDateLocal: string;
  field: 'amount' | 'category';
  newAmount?: number;
  newCategoryId?: string;
  newCategoryName?: string;
}

/**
 * Reads the pending correction state from the session context.
 * Returns null if no session row exists or no pending correction is present.
 */
export async function getPendingCorrection(
  db: DbPool,
  userId: string,
): Promise<PendingCorrectionState | null> {
  const result = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = result[0];
  if (!row) return null;

  const state = row.context_json['pendingCorrection'];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;

  return state as PendingCorrectionState;
}

/**
 * Stores a pending correction state in the session context.
 *
 * Removes 'pendingTransaction' and 'pendingDelete' so that a да/нет reply
 * cannot simultaneously confirm two different pending operations.
 * Sets session_status to 'awaiting_confirmation'.
 */
export async function setPendingCorrection(
  db: DbPool,
  userId: string,
  state: PendingCorrectionState,
): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = (context_json - 'pendingTransaction' - 'pendingDelete') || ${db.json({ pendingCorrection: state } as any)},
           session_status       = 'awaiting_confirmation',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}

/**
 * Removes the pending correction state from the session context.
 * Resets session_status to 'idle'.
 */
export async function clearPendingCorrection(db: DbPool, userId: string): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = context_json - 'pendingCorrection',
           session_status       = 'idle',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}
