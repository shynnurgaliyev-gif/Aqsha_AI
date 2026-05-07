import crypto from 'node:crypto';
import type { DbPool } from '@aqsha-ai/database';

const SESSION_TTL_HOURS = 24;

/**
 * Creates a new Mini App session for the given user.
 * Returns the raw (unhashed) token to send to the client.
 * Only the SHA-256 hash is stored in the database.
 */
export async function createMiniSession(db: DbPool, userId: string): Promise<string> {
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  // Clean up old sessions for this user to avoid unbounded growth
  await db`
    DELETE FROM public.mini_sessions
     WHERE user_id = ${userId}::uuid
       AND expires_at < now()
  `;

  await db`
    INSERT INTO public.mini_sessions (user_id, token_hash, expires_at)
    VALUES (${userId}::uuid, ${tokenHash}, ${expiresAt})
  `;

  return rawToken;
}

/**
 * Resolves a raw token to user_id + the user's current_plan_status in one query.
 * Returns null if the token is not found, has expired, or the user is inactive.
 *
 * Used by the Mini App access gate so an existing token cannot keep accessing
 * data after the user's plan moves to expired/blocked/canceled.
 */
export async function getMiniSessionContext(
  db: DbPool,
  rawToken: string,
): Promise<{ userId: string; currentPlanStatus: string } | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const rows = await db<{ user_id: string; current_plan_status: string }[]>`
    SELECT s.user_id::text, u.current_plan_status
      FROM public.mini_sessions s
      JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = ${tokenHash}
       AND s.expires_at > now()
       AND u.is_active = true
  `;
  const row = rows[0];
  if (!row) return null;
  return { userId: row.user_id, currentPlanStatus: row.current_plan_status };
}
