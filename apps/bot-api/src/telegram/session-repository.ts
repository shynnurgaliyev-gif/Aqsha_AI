import type { DbPool } from '@aqsha-ai/database';

/**
 * Ensures exactly one user_sessions row exists for the given user.
 * Idempotent — safe to call on every incoming message.
 *
 * Does NOT reset session_status or context_json if a row already exists.
 * Multi-step flow state is managed separately by the session/flow layer.
 */
export async function ensureUserSession(db: DbPool, userId: string): Promise<void> {
  await db`
    INSERT INTO user_sessions (user_id, session_status)
    VALUES (${userId}, 'idle')
    ON CONFLICT (user_id) DO NOTHING
  `;
}
