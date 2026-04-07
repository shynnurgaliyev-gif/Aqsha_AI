import type { DbPool } from '@aqsha-ai/database';

/**
 * Pending recurring expense draft stored in user_sessions.context_json.
 * Key: "pendingRecurring"
 * Set after parsing the create command; cleared after the user picks a reminder hour.
 */
export interface PendingRecurringDraft {
  description: string;
  amount: number;
  dayOfMonth: number;
}

export async function getPendingRecurringDraft(
  db: DbPool,
  userId: string,
): Promise<PendingRecurringDraft | null> {
  const result = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = result[0];
  if (!row) return null;

  const draft = row.context_json['pendingRecurring'];
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;

  return draft as PendingRecurringDraft;
}

export async function setPendingRecurringDraft(
  db: DbPool,
  userId: string,
  draft: PendingRecurringDraft,
): Promise<void> {
  await db`
    UPDATE user_sessions
    SET
      context_json         = context_json || ${db.json({ pendingRecurring: draft } as any)},
      session_status       = 'awaiting_confirmation',
      last_user_message_at = now()
    WHERE user_id = ${userId}
  `;
}

export async function clearPendingRecurringDraft(
  db: DbPool,
  userId: string,
): Promise<void> {
  await db`
    UPDATE user_sessions
    SET
      context_json         = context_json - 'pendingRecurring',
      session_status       = 'idle',
      last_user_message_at = now()
    WHERE user_id = ${userId}
  `;
}
