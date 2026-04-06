import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

interface TrialUser {
  userId: string;
}

/**
 * Finds users whose trial subscription expires within the next 24 hours
 * and who have NOT yet received a trial_expiry_reminder job today (local date).
 *
 * Sends one reminder at 9 AM local time on the last day of the trial.
 */
async function findUsersNeedingTrialExpiryReminder(db: DbPool): Promise<TrialUser[]> {
  return db<TrialUser[]>`
    SELECT u.id::text AS "userId"
      FROM public.users u
      JOIN public.subscriptions s ON s.user_id = u.id AND s.is_current = true
     WHERE s.status = 'trial'
       AND s.trial_end_at IS NOT NULL
       AND s.trial_end_at <= now() + interval '1 day'
       AND u.is_active = true
       AND EXTRACT(HOUR FROM now() AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC')) >= 9
       AND NOT EXISTS (
         SELECT 1
           FROM public.job_queue jq
          WHERE jq.user_id = u.id
            AND jq.job_type = 'trial_expiry_reminder'
            AND jq.status IN ('pending', 'processing', 'done')
            AND jq.created_at >= (
              (now() AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC'))::date
            )::timestamptz
       )
  `;
}

async function enqueueTrialExpiryReminderJob(db: DbPool, userId: string): Promise<void> {
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('trial_expiry_reminder', ${userId}::uuid, ${db.json({} as any)}, 'pending', now(), 2)
  `;
}

/**
 * Scheduler pass for trial expiry reminders.
 *
 * Runs on every worker tick. Enqueues one trial_expiry_reminder job per user
 * on the last day of their trial (dedup enforced by checking for an existing
 * job created today in the user's local timezone).
 */
export async function runTrialExpiryReminderScheduler(db: DbPool, logger: Logger): Promise<void> {
  let users: TrialUser[];

  try {
    users = await findUsersNeedingTrialExpiryReminder(db);
  } catch (err) {
    logger.error({ err }, 'Failed to query users for trial expiry reminder scheduling');
    return;
  }

  if (users.length === 0) return;

  logger.info({ count: users.length }, 'Scheduling trial expiry reminder jobs');

  for (const user of users) {
    try {
      await enqueueTrialExpiryReminderJob(db, user.userId);
      logger.info({ userId: user.userId }, 'Enqueued trial_expiry_reminder job');
    } catch (err) {
      logger.error({ err, userId: user.userId }, 'Failed to enqueue trial expiry reminder job');
    }
  }
}
