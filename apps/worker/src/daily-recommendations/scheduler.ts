import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

interface EligibleUser {
  id: string;
}

/**
 * Returns users who are eligible for a daily recommendation generation job
 * and do not already have one enqueued or generated for today.
 *
 * Eligibility conditions (all must hold):
 *   - user is active
 *   - daily_recommendations_enabled = true
 *   - timezone is set (non-empty string)
 *   - current hour in user's local timezone >= daily_recommendations_hour
 *     (the configured delivery hour has started in the user's local day)
 *
 * Dedup conditions (either blocks enqueue):
 *   - a daily_recommendations row already exists for today's local date
 *     (recommendation already generated; the unique DB constraint enforces this)
 *   - a daily_recommendation_generate job in pending or processing state
 *     already exists for this user, created since UTC midnight today
 *     (generation already queued but not yet executed)
 *
 * Safe to call on every worker tick — all filtering is done in a single SQL pass.
 */
async function findUsersNeedingGenerationJob(db: DbPool): Promise<EligibleUser[]> {
  return db<EligibleUser[]>`
    SELECT u.id::text
    FROM public.users u
    WHERE u.is_active = true
      AND u.daily_recommendations_enabled = true
      AND u.timezone <> ''
      AND EXTRACT(HOUR FROM now() AT TIME ZONE u.timezone) >= u.daily_recommendations_hour
      AND NOT EXISTS (
        SELECT 1
        FROM public.daily_recommendations dr
        WHERE dr.user_id = u.id
          AND dr.recommendation_date_local = (now() AT TIME ZONE u.timezone)::date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.job_queue jq
        WHERE jq.user_id = u.id
          AND jq.job_type = 'daily_recommendation_generate'
          AND jq.status IN ('pending', 'processing', 'done')
          AND jq.created_at >= (now()::date)::timestamptz
      )
  `;
}

/**
 * Inserts a daily_recommendation_generate job for the given user.
 * user_id is stored on the job row; payload_json is empty.
 */
async function enqueueGenerationJob(db: DbPool, userId: string): Promise<void> {
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('daily_recommendation_generate', ${userId}::uuid, ${db.json({} as any)}, 'pending', now(), 3)
  `;
}

/**
 * Scheduler pass for daily recommendations.
 *
 * Scans eligible users and enqueues a daily_recommendation_generate job for
 * each user whose recommendation has not yet been generated or enqueued today.
 *
 * Safe to call on every worker tick — dedup is enforced in SQL.
 * Individual enqueue failures are caught and logged; one failure does not
 * abort the pass for remaining users.
 */
export async function runDailyRecommendationScheduler(
  db: DbPool,
  logger: Logger,
): Promise<void> {
  let users: EligibleUser[];

  try {
    users = await findUsersNeedingGenerationJob(db);
  } catch (err) {
    logger.error({ err }, 'Failed to query users for daily recommendation scheduling');
    return;
  }

  if (users.length === 0) {
    return;
  }

  logger.info({ count: users.length }, 'Scheduling daily recommendation generation jobs');

  for (const user of users) {
    try {
      await enqueueGenerationJob(db, user.id);
      logger.info({ userId: user.id }, 'Enqueued daily_recommendation_generate job');
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to enqueue daily recommendation generation job');
    }
  }
}
