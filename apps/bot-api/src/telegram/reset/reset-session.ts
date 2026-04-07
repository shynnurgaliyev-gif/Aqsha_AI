import type { DbPool } from '@aqsha-ai/database';

/**
 * Pending reset state stored in user_sessions.context_json under key "pendingReset".
 */
export interface PendingResetState {
  setAt: string; // ISO string — used to expire stale states
}

export async function getPendingReset(
  db: DbPool,
  userId: string,
): Promise<PendingResetState | null> {
  const rows = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  const state = row.context_json['pendingReset'];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return state as PendingResetState;
}

export async function setPendingReset(db: DbPool, userId: string): Promise<void> {
  const state: PendingResetState = { setAt: new Date().toISOString() };
  await db`
    UPDATE user_sessions
       SET context_json         = (context_json
                                    - 'pendingTransaction'
                                    - 'pendingDelete'
                                    - 'pendingCorrection'
                                    - 'pendingBillingPhone')
                                  || ${db.json({ pendingReset: state } as any)},
           session_status       = 'awaiting_confirmation',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}

export async function clearPendingReset(db: DbPool, userId: string): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = context_json - 'pendingReset',
           session_status       = 'idle',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}
