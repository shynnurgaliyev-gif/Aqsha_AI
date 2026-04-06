import type { DbPool } from '@aqsha-ai/database';

/**
 * Stores a pending recurring expense creation waiting for the user
 * to choose a day of month via the inline keyboard.
 */
export interface PendingRecurringDraft {
  description: string;
  amount: number;
  setAt: string; // ISO string — for expiry checks if needed
}

export async function getPendingRecurringDraft(
  db: DbPool,
  userId: string,
): Promise<PendingRecurringDraft | null> {
  const rows = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  const state = row.context_json['pendingRecurringDraft'];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return state as PendingRecurringDraft;
}

export async function setPendingRecurringDraft(
  db: DbPool,
  userId: string,
  draft: Omit<PendingRecurringDraft, 'setAt'>,
): Promise<void> {
  const state: PendingRecurringDraft = { ...draft, setAt: new Date().toISOString() };
  await db`
    UPDATE user_sessions
       SET context_json         = context_json || ${db.json({ pendingRecurringDraft: state } as any)},
           session_status       = 'awaiting_confirmation',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}

export async function clearPendingRecurringDraft(db: DbPool, userId: string): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = context_json - 'pendingRecurringDraft',
           session_status       = 'idle',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}
