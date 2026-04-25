import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

interface GraceUser {
  userId: string;
  daysLeft: number;
}

/**
 * Finds users in the grace period whose morning reminder hour has arrived
 * and who have NOT yet received a grace_reminder_send job today (local date).
 *
 * Sends one reminder per day during the 3-day grace window.
 * Reminder hour: 9 AM in the user's local timezone.
 */
async function findUsersNeedingGraceReminder(db: DbPool): Promise<GraceUser[]> {
  return db<GraceUser[]>`
    SELECT
      u.id::text                                                        AS "userId",
      GREATEST(
        0,
        CEIL(
          EXTRACT(EPOCH FROM (u.grace_period_end - now())) / 86400
        )::int
      )                                                                 AS "daysLeft"
    FROM public.users u
    WHERE u.current_plan_status = 'grace'
      AND u.grace_period_end IS NOT NULL
      AND u.grace_period_end > now()
      AND u.is_active = true
      AND EXTRACT(HOUR FROM now() AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC')) >= 9
      AND NOT EXISTS (
        SELECT 1
        FROM public.job_queue jq
        WHERE jq.user_id = u.id
          AND jq.job_type = 'grace_reminder_send'
          AND jq.status IN ('pending', 'processing', 'done')
          AND jq.created_at >= (
            (now() AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC'))::date
          )::timestamptz
      )
  `;
}

async function enqueueGraceReminderJob(db: DbPool, userId: string, daysLeft: number): Promise<void> {
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('grace_reminder_send', ${userId}::uuid, ${db.json({ daysLeft } as any)}, 'pending', now(), 2)
  `;
}

/**
 * Scheduler pass for grace period reminders.
 *
 * Runs on every worker tick. Enqueues one grace_reminder_send job per user per day
 * (dedup enforced by checking for an existing job created today in user's local timezone).
 */
export async function runGraceReminderScheduler(db: DbPool, logger: Logger): Promise<void> {
  let users: GraceUser[];

  try {
    users = await findUsersNeedingGraceReminder(db);
  } catch (err) {
    logger.error({ err }, 'Failed to query users for grace reminder scheduling');
    return;
  }

  if (users.length === 0) return;

  logger.info({ count: users.length }, 'Scheduling grace reminder jobs');

  for (const user of users) {
    try {
      await enqueueGraceReminderJob(db, user.userId, user.daysLeft);
      logger.info({ userId: user.userId, daysLeft: user.daysLeft }, 'Enqueued grace_reminder_send job');
    } catch (err) {
      logger.error({ err, userId: user.userId }, 'Failed to enqueue grace reminder job');
    }
  }
}
