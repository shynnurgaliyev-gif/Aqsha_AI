import type { DbPool } from '@aqsha-ai/database';
import type { BulkDeletePeriod } from './correction-bulk-delete-matcher';

/**
 * Pending bulk-delete state stored in user_sessions.context_json
 * under key "pendingBulkDelete".
 */
export interface PendingBulkDeleteState {
  period: BulkDeletePeriod;
  kind?: 'expense' | 'income';
  count: number;
  totalAmount: number;
  dateFrom: string;   // YYYY-MM-DD
  dateTo: string;     // YYYY-MM-DD
  periodLabel: string;
}

export async function getPendingBulkDelete(
  db: DbPool,
  userId: string,
): Promise<PendingBulkDeleteState | null> {
  const result = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = result[0];
  if (!row) return null;
  const state = row.context_json['pendingBulkDelete'];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return state as PendingBulkDeleteState;
}

/**
 * Stores a pending bulk-delete state and clears all other pending states
 * so that да/нет cannot simultaneously trigger two confirmations.
 */
export async function setPendingBulkDelete(
  db: DbPool,
  userId: string,
  state: PendingBulkDeleteState,
): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = (context_json - 'pendingTransaction' - 'pendingDelete' - 'pendingCorrection')
                                  || ${db.json({ pendingBulkDelete: state } as any)},
           session_status       = 'awaiting_confirmation',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}

export async function clearPendingBulkDelete(db: DbPool, userId: string): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = context_json - 'pendingBulkDelete',
           session_status       = 'idle',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}
