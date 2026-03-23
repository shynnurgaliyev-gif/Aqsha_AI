import type { Logger } from 'pino';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { claimNextJob, markJobDone, markJobFailed } from './repository';
import { getHandler } from './registry';

/**
 * Claims and processes up to JOB_BATCH_SIZE jobs in a single worker tick.
 *
 * For each job:
 *   1. Claim one runnable job (returns null when queue is empty).
 *   2. Resolve the handler by job_type.
 *   3. Unknown job type → mark failed immediately with a descriptive error.
 *   4. Known handler → run it; mark done on success, mark failed on throw.
 *
 * A failure on one job does not stop processing of subsequent jobs.
 * Errors from markJobDone / markJobFailed are allowed to propagate — the
 * caller (worker tick) has its own top-level error boundary.
 */
export async function processJobs(
  db: DbPool,
  env: AppEnv,
  logger: Logger,
): Promise<void> {
  const workerId = `${env.APP_NAME}@${process.pid}`;
  let claimed = 0;

  while (claimed < env.JOB_BATCH_SIZE) {
    const job = await claimNextJob(db, workerId);

    if (!job) {
      break; // No more runnable jobs in this tick
    }

    claimed++;

    const handler = getHandler(job.job_type);

    if (!handler) {
      const error = `Unknown job type: ${job.job_type}`;
      logger.warn({ jobId: job.id, jobType: job.job_type }, error);
      await markJobFailed(db, job.id, error);
      continue;
    }

    try {
      await handler(job, { db, env, logger });
      await markJobDone(db, job.id);
      logger.info({ jobId: job.id, jobType: job.job_type, attempts: job.attempts }, 'Job done');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ err, jobId: job.id, jobType: job.job_type, attempts: job.attempts }, 'Job failed');
      await markJobFailed(db, job.id, error);
    }
  }

  if (claimed > 0) {
    logger.debug({ claimed }, 'Tick processed jobs');
  }
}
