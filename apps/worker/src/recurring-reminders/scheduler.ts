import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

interface DueRecurring {
  userId: string;
  recurringId: string;
  description: string;
  amount: number;
  categoryName: string;
}

/**
 * Finds recurring expenses whose reminder is due on the current worker tick.
 *
 * Conditions (all must hold):
 *   - recurring expense is active
 *   - user is active with a non-empty timezone
 *   - today's day-of-month in user's timezone matches day_of_month
 *   - current hour in user's timezone >= reminder_hour (fires even if worker was briefly down)
 *   - last_reminded_month is not the current month in user's timezone
 *   - no recurring_reminder_send job for this recurring_id already created today (UTC)
 */
async function findDueRecurringExpenses(db: DbPool): Promise<DueRecurring[]> {
  return db<DueRecurring[]>`
    SELECT
      u.id::text                  AS "userId",
      re.id::text                 AS "recurringId",
      re.description,
      re.amount,
      re.category_name            AS "categoryName"
    FROM public.recurring_expenses re
    JOIN public.users u ON u.id = re.user_id
    WHERE re.is_active = true
      AND u.is_active = true
      AND u.timezone <> ''
      AND EXTRACT(DAY  FROM (now() AT TIME ZONE u.timezone)) = re.day_of_month
      AND EXTRACT(HOUR FROM (now() AT TIME ZONE u.timezone)) >= re.reminder_hour
      AND (
        re.last_reminded_month IS NULL
        OR re.last_reminded_month <> to_char((now() AT TIME ZONE u.timezone), 'YYYY-MM')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.job_queue jq
        WHERE jq.payload_json->>'recurringId' = re.id::text
          AND jq.job_type = 'recurring_reminder_send'
          AND jq.created_at >= date_trunc('day', now())
      )
  `;
}

async function enqueueRecurringReminderJob(
  db: DbPool,
  userId: string,
  recurringId: string,
  description: string,
  amount: number,
  categoryName: string,
): Promise<void> {
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES (
      'recurring_reminder_send',
      ${userId}::uuid,
      ${db.json({ recurringId, description, amount, categoryName } as any)},
      'pending',
      now(),
      3
    )
  `;
}

/**
 * Scheduler pass for recurring expense reminders.
 * Safe to call on every worker tick — all filtering is done in one SQL pass.
 */
export async function runRecurringReminderScheduler(db: DbPool, logger: Logger): Promise<void> {
  let due: DueRecurring[];

  try {
    due = await findDueRecurringExpenses(db);
  } catch (err) {
    logger.error({ err }, 'Failed to query due recurring expenses');
    return;
  }

  if (due.length === 0) return;

  logger.info({ count: due.length }, 'Scheduling recurring reminder jobs');

  for (const r of due) {
    try {
      await enqueueRecurringReminderJob(db, r.userId, r.recurringId, r.description, r.amount, r.categoryName);
      logger.info({ userId: r.userId, recurringId: r.recurringId, description: r.description }, 'Enqueued recurring_reminder_send job');
    } catch (err) {
      logger.error({ err, userId: r.userId, recurringId: r.recurringId }, 'Failed to enqueue recurring reminder job');
    }
  }
}
