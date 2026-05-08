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
 * Extracts `pendingTransaction` from a context_json blob, returning null
 * if absent or malformed. Pure helper — no DB access.
 */
function pickSingleDraft(context: Record<string, unknown>): PendingTransactionDraft | null {
  const draft = context['pendingTransaction'];
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  return draft as PendingTransactionDraft;
}

/**
 * Extracts `pendingBulkTransaction` from a context_json blob.
 */
function pickBulkDraft(context: Record<string, unknown>): PendingBulkDraft | null {
  const draft = context['pendingBulkTransaction'];
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  return draft as PendingBulkDraft;
}

/**
 * Reads both pending drafts (single + bulk) in a single SQL round-trip.
 * Use this in hot paths (text/voice intake) instead of calling
 * getPendingDraft + getPendingBulkDraft separately.
 */
export async function getPendingDrafts(
  db: DbPool,
  userId: string,
): Promise<{ single: PendingTransactionDraft | null; bulk: PendingBulkDraft | null }> {
  const result = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = result[0];
  if (!row) return { single: null, bulk: null };
  return {
    single: pickSingleDraft(row.context_json),
    bulk: pickBulkDraft(row.context_json),
  };
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
  return pickSingleDraft(row.context_json);
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
      context_json         = (context_json - 'pendingDelete' - 'pendingCorrection') || ${db.json({ pendingTransaction: draft } as any)},
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

// ── Bulk draft ────────────────────────────────────────────────────────────────

/**
 * One item in a pending bulk draft.
 */
export interface BulkDraftItem {
  kind: IntakeKind;
  amount: number;
  categoryId: string;
  categoryName: string;
  rawText: string;
}

/**
 * Pending bulk draft stored inside user_sessions.context_json.
 * Key: "pendingBulkTransaction"
 */
export interface PendingBulkDraft {
  items: BulkDraftItem[];
}

export async function getPendingBulkDraft(
  db: DbPool,
  userId: string,
): Promise<PendingBulkDraft | null> {
  const result = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = result[0];
  if (!row) return null;
  return pickBulkDraft(row.context_json);
}

export async function setPendingBulkDraft(
  db: DbPool,
  userId: string,
  draft: PendingBulkDraft,
): Promise<void> {
  await db`
    UPDATE user_sessions
    SET
      context_json         = (context_json - 'pendingTransaction' - 'pendingDelete' - 'pendingCorrection') || ${db.json({ pendingBulkTransaction: draft } as any)},
      session_status       = 'awaiting_confirmation',
      last_user_message_at = now()
    WHERE user_id = ${userId}
  `;
}

export async function clearPendingBulkDraft(db: DbPool, userId: string): Promise<void> {
  await db`
    UPDATE user_sessions
    SET
      context_json         = context_json - 'pendingBulkTransaction',
      session_status       = 'idle',
      last_user_message_at = now()
    WHERE user_id = ${userId}
  `;
}
