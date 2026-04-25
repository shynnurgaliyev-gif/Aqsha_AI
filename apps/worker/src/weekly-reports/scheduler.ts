import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

const WEEKLY_REPORT_HOUR = 10; // 10:00 in user's local timezone (Sunday)

interface EligibleUser {
  id: string;
}

/**
 * Returns users eligible for a weekly report generation job.
 *
 * Eligibility conditions (all must hold):
 *   - user is active
 *   - plan is not expired or blocked
 *   - timezone is set (non-empty string)
 *   - today is Sunday (DOW = 0) in the user's local timezone
 *   - current local hour >= WEEKLY_REPORT_HOUR (10)
 *
 * Dedup conditions (either blocks enqueue):
 *   - a weekly_reports row already exists for this week's Monday (week_start_date)
 *   - a weekly_report_generate job in pending or processing state already exists
 *     for this user, created since UTC midnight today
 *
 * Safe to call on every worker tick — all filtering is done in a single SQL pass.
 */
async function findUsersNeedingWeeklyReportJob(db: DbPool): Promise<EligibleUser[]> {
  return db<EligibleUser[]>`
    SELECT u.id::text
    FROM public.users u
    WHERE u.is_active = true
      AND u.current_plan_status NOT IN ('expired', 'blocked')
      AND u.timezone <> ''
      AND EXTRACT(DOW  FROM (now() AT TIME ZONE u.timezone)) = 0
      AND EXTRACT(HOUR FROM (now() AT TIME ZONE u.timezone)) >= ${WEEKLY_REPORT_HOUR}
      AND NOT EXISTS (
        SELECT 1
        FROM public.weekly_reports wr
        WHERE wr.user_id = u.id
          AND wr.week_start_date = date_trunc('week', (now() AT TIME ZONE u.timezone)::date)::date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.job_queue jq
        WHERE jq.user_id  = u.id
          AND jq.job_type = 'weekly_report_generate'
          AND jq.status   IN ('pending', 'processing', 'done')
          AND jq.created_at >= (now()::date)::timestamptz
      )
  `;
}

async function enqueueGenerationJob(db: DbPool, userId: string): Promise<void> {
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('weekly_report_generate', ${userId}::uuid, ${db.json({} as any)}, 'pending', now(), 3)
  `;
}

/**
 * Scheduler pass for weekly reports.
 *
 * Scans eligible users on Sunday >= 10:00 local time and enqueues a
 * weekly_report_generate job for each user who hasn't received this week's report yet.
 *
 * Safe to call on every worker tick — dedup is enforced in SQL.
 */
export async function runWeeklyReportScheduler(
  db: DbPool,
  logger: Logger,
): Promise<void> {
  let users: EligibleUser[];

  try {
    users = await findUsersNeedingWeeklyReportJob(db);
  } catch (err) {
    logger.error({ err }, 'Failed to query users for weekly report scheduling');
    return;
  }

  if (users.length === 0) return;

  logger.info({ count: users.length }, 'Scheduling weekly report generation jobs');

  for (const user of users) {
    try {
      await enqueueGenerationJob(db, user.id);
      logger.info({ userId: user.id }, 'Enqueued weekly_report_generate job');
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to enqueue weekly report generation job');
    }
  }
}
