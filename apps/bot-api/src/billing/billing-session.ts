import type { DbPool } from '@aqsha-ai/database';

/**
 * Tracks whether the user is in "enter phone for billing" mode.
 * Stored in user_sessions.context_json under key "pendingBillingPhone".
 */
export interface PendingBillingPhoneState {
  setAt: string; // ISO string — used to expire stale states
}

export async function getPendingBillingPhone(
  db: DbPool,
  userId: string,
): Promise<PendingBillingPhoneState | null> {
  const rows = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  const state = row.context_json['pendingBillingPhone'];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return state as PendingBillingPhoneState;
}

export async function setPendingBillingPhone(db: DbPool, userId: string): Promise<void> {
  const state: PendingBillingPhoneState = { setAt: new Date().toISOString() };
  await db`
    UPDATE user_sessions
       SET context_json         = context_json || ${db.json({ pendingBillingPhone: state } as any)},
           session_status       = 'awaiting_confirmation',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}

export async function clearPendingBillingPhone(db: DbPool, userId: string): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = context_json - 'pendingBillingPhone',
           session_status       = 'idle',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}

// ── Phone confirmation draft ───────────────────────────────────────────────────

/**
 * Temporary state holding a parsed phone number while awaiting user confirmation.
 * Key: "pendingPhoneConfirm"
 */
export interface PendingPhoneConfirmState {
  phone: string;
  setAt: string;
}

export async function getPendingPhoneConfirm(
  db: DbPool,
  userId: string,
): Promise<PendingPhoneConfirmState | null> {
  const rows = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  const state = row.context_json['pendingPhoneConfirm'];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return state as PendingPhoneConfirmState;
}

export async function setPendingPhoneConfirm(
  db: DbPool,
  userId: string,
  phone: string,
): Promise<void> {
  const state: PendingPhoneConfirmState = { phone, setAt: new Date().toISOString() };
  await db`
    UPDATE user_sessions
       SET context_json         = context_json || ${db.json({ pendingPhoneConfirm: state } as any)},
           session_status       = 'awaiting_confirmation',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}

export async function clearPendingPhoneConfirm(
  db: DbPool,
  userId: string,
): Promise<void> {
  await db`
    UPDATE user_sessions
       SET context_json         = context_json - 'pendingPhoneConfirm',
           session_status       = 'idle',
           last_user_message_at = now()
     WHERE user_id = ${userId}
  `;
}
