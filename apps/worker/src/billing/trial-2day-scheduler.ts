import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

interface TrialUser {
  userId: string;
}

/**
 * Finds users whose trial ends in 2–3 days (i.e. exactly "2 days left" window)
 * and who have NOT yet received a trial_2day_reminder today (local date).
 *
 * Fires once at 9 AM in the user's local timezone.
 */
async function findUsersNeedingTrial2DayReminder(db: DbPool): Promise<TrialUser[]> {
  return db<TrialUser[]>`
    SELECT u.id::text AS "userId"
      FROM public.users u
     WHERE u.current_plan_status = 'trial'
       AND u.current_period_end IS NOT NULL
       AND u.current_period_end >  now() + interval '2 days'
       AND u.current_period_end <= now() + interval '3 days'
       AND u.is_active = true
       AND EXTRACT(HOUR FROM now() AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC')) >= 9
       AND NOT EXISTS (
         SELECT 1
           FROM public.job_queue jq
          WHERE jq.user_id = u.id
            AND jq.job_type = 'trial_2day_reminder'
            AND jq.status IN ('pending', 'processing', 'done')
            AND jq.created_at >= (
              (now() AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC'))::date
            )::timestamptz
       )
  `;
}

async function enqueueTrial2DayReminderJob(db: DbPool, userId: string): Promise<void> {
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('trial_2day_reminder', ${userId}::uuid, ${db.json({} as any)}, 'pending', now(), 2)
  `;
}

/**
 * Scheduler pass for 2-day trial expiry reminders.
 *
 * Runs on every worker tick. Enqueues one trial_2day_reminder job per user
 * when exactly 2 days remain in their trial period.
 */
export async function runTrial2DayReminderScheduler(db: DbPool, logger: Logger): Promise<void> {
  let users: TrialUser[];

  try {
    users = await findUsersNeedingTrial2DayReminder(db);
  } catch (err) {
    logger.error({ err }, 'Failed to query users for trial 2-day reminder scheduling');
    return;
  }

  if (users.length === 0) return;

  logger.info({ count: users.length }, 'Scheduling trial 2-day reminder jobs');

  for (const user of users) {
    try {
      await enqueueTrial2DayReminderJob(db, user.userId);
      logger.info({ userId: user.userId }, 'Enqueued trial_2day_reminder job');
    } catch (err) {
      logger.error({ err, userId: user.userId }, 'Failed to enqueue trial 2-day reminder job');
    }
  }
}
