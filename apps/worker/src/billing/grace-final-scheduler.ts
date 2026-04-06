import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

interface GraceFinalUser {
  userId: string;
}

/**
 * Finds users in grace period whose last grace day has arrived
 * (paid_until + 3 days expires within the next 24 hours) and who have NOT
 * yet received a grace_final_reminder job today (local date).
 *
 * Sends one final warning at 9 AM local time on the last day of grace.
 */
async function findUsersNeedingGraceFinalReminder(db: DbPool): Promise<GraceFinalUser[]> {
  return db<GraceFinalUser[]>`
    SELECT u.id::text AS "userId"
      FROM public.users u
     WHERE u.current_plan_status = 'grace'
       AND u.grace_period_end IS NOT NULL
       AND u.grace_period_end <= now() + interval '1 day'
       AND u.grace_period_end > now()
       AND u.is_active = true
       AND EXTRACT(HOUR FROM now() AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC')) >= 9
       AND NOT EXISTS (
         SELECT 1
           FROM public.job_queue jq
          WHERE jq.user_id = u.id
            AND jq.job_type = 'grace_final_reminder'
            AND jq.status IN ('pending', 'processing', 'done')
            AND jq.created_at >= (
              (now() AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC'))::date
            )::timestamptz
       )
  `;
}

async function enqueueGraceFinalReminderJob(db: DbPool, userId: string): Promise<void> {
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('grace_final_reminder', ${userId}::uuid, ${db.json({} as any)}, 'pending', now(), 2)
  `;
}

/**
 * Scheduler pass for the final grace period reminder.
 *
 * Runs on every worker tick. Enqueues one grace_final_reminder job per user
 * on the last day of their grace window before access is cut off.
 */
export async function runGraceFinalReminderScheduler(db: DbPool, logger: Logger): Promise<void> {
  let users: GraceFinalUser[];

  try {
    users = await findUsersNeedingGraceFinalReminder(db);
  } catch (err) {
    logger.error({ err }, 'Failed to query users for grace final reminder scheduling');
    return;
  }

  if (users.length === 0) return;

  logger.info({ count: users.length }, 'Scheduling grace final reminder jobs');

  for (const user of users) {
    try {
      await enqueueGraceFinalReminderJob(db, user.userId);
      logger.info({ userId: user.userId }, 'Enqueued grace_final_reminder job');
    } catch (err) {
      logger.error({ err, userId: user.userId }, 'Failed to enqueue grace final reminder job');
    }
  }
}
