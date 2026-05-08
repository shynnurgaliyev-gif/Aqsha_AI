import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

/**
 * Per-tick cleanup throttle. Runs at most once every CLEANUP_INTERVAL_MS
 * regardless of how often the worker tick fires (default tick is ~5s).
 * One pass per hour is plenty — expired tokens are already rejected at the
 * app layer; this is just storage hygiene.
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let lastRunAt = 0;

/**
 * Deletes mini-app session tokens that have been expired for more than
 * the retention grace window. The grace window keeps recently-expired rows
 * around so audit logs can correlate a 401 to an expired token.
 */
const EXPIRED_RETENTION_DAYS = 7;

/**
 * Throttled cleanup of expired mini_sessions rows.
 *
 * Wired into the worker tick loop. Skips no-op iterations cheaply: only
 * runs the DELETE once per CLEANUP_INTERVAL_MS. Failures are logged and
 * swallowed — cleanup is best-effort and must not block other schedulers.
 */
export async function runMiniSessionsCleanup(db: DbPool, logger: Logger): Promise<void> {
  const now = Date.now();
  if (now - lastRunAt < CLEANUP_INTERVAL_MS) return;
  lastRunAt = now;

  try {
    const rows = await db<Array<{ count: string }>>`
      WITH deleted AS (
        DELETE FROM public.mini_sessions
         WHERE expires_at < now() - make_interval(days => ${EXPIRED_RETENTION_DAYS})
        RETURNING id
      )
      SELECT count(*)::text AS count FROM deleted
    `;
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) {
      logger.info({ count }, 'mini_sessions cleanup: removed expired rows');
    }
  } catch (err) {
    logger.error({ err }, 'mini_sessions cleanup: failed');
  }
}
