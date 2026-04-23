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
 * Resolves a raw token to its user_id.
 * Returns null if the token is not found or has expired.
 */
export async function getMiniSessionUserId(db: DbPool, rawToken: string): Promise<string | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const rows = await db<{ user_id: string }[]>`
    SELECT user_id::text
      FROM public.mini_sessions
     WHERE token_hash = ${tokenHash}
       AND expires_at > now()
  `;
  return rows[0]?.user_id ?? null;
}
