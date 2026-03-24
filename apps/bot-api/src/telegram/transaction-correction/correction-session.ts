import type { DbPool } from '@aqsha-ai/database';

/**
 * Pending delete state stored in user_sessions.context_json under key "pendingDelete".
 */
export interface PendingDeleteState {
  transactionId: string;
  kind: 'expense' | 'income';
  amount: number;
  categoryName: string;
  transactionDateLocal: string;
}

/**
 * Reads the pending delete state from the session context.
 * Returns null if no session row exists or no pending delete is present.
 */
export async function getPendingDelete(
  db: DbPool,
  userId: string,
): Promise<PendingDeleteState | null> {
  const result = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = result[0];
  if (!row) return null;

  const state = row.context_json['pendingDelete'];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;

  return state as PendingDeleteState;
}

/**
 * Stores a pending delete state in the session context.
 *
 * Also removes any existing 'pendingTransaction' key so that a да/нет reply
 * cannot simultaneously confirm both a pending transaction draft and a delete.
 * Sets session_status to 'awaiting_confirmation'.
 */
export async function setPendingDelete(
  db: DbPool,
  userId: string,
  state: PendingDeleteState,
): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = (context_json - 'pendingTransaction') || ${db.json({ pendingDelete: state } as any)},
           session_status       = 'awaiting_confirmation',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}

/**
 * Removes the pending delete state from the session context.
 * Resets session_status to 'idle'.
 */
export async function clearPendingDelete(db: DbPool, userId: string): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = context_json - 'pendingDelete',
           session_status       = 'idle',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}
