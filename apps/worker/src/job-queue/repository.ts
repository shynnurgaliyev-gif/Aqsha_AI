import type { DbPool } from '@aqsha-ai/database';
import type { JobRow } from './types';

/**
 * Atomically claims the next runnable job from public.job_queue.
 *
 * A job is runnable when:
 *   - status = 'pending'
 *   - run_after <= now()
 *   - attempts < max_attempts
 *
 * The claim increments attempts, sets status='processing', records locked_at
 * and locked_by, and returns the updated row.
 *
 * Uses FOR UPDATE SKIP LOCKED so concurrent workers never claim the same job.
 * Safe under Supabase PgBouncer transaction mode — the entire operation is a
 * single SQL statement with no application-side transaction management needed.
 *
 * Returns null if no runnable job is available.
 */
export async function claimNextJob(db: DbPool, workerId: string): Promise<JobRow | null> {
  const rows = await db<JobRow[]>`
    UPDATE public.job_queue
    SET
      status    = 'processing',
      attempts  = attempts + 1,
      locked_at = now(),
      locked_by = ${workerId}
    WHERE id = (
      SELECT id
      FROM public.job_queue
      WHERE status = 'pending'
        AND run_after <= now()
        AND attempts < max_attempts
      ORDER BY run_after ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Marks a claimed job as successfully completed.
 */
export async function markJobDone(db: DbPool, jobId: string): Promise<void> {
  await db`
    UPDATE public.job_queue
    SET status = 'done'
    WHERE id = ${jobId}
  `;
}

/**
 * Marks a claimed job as failed and records the error message.
 */
export async function markJobFailed(db: DbPool, jobId: string, error: string): Promise<void> {
  await db`
    UPDATE public.job_queue
    SET
      status     = 'failed',
      last_error = ${error}
    WHERE id = ${jobId}
  `;
}
