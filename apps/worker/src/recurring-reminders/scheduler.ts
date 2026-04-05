import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

interface EligibleRecurring {
  id: string;
  userId: string;
}

/**
 * Returns active recurring expenses that need a reminder today.
 *
 * Eligibility conditions (all must hold):
 *   - recurring expense is active
 *   - user is active and plan is not expired or blocked
 *   - user timezone is set
 *   - today's day-of-month (in user's timezone) >= the recurring expense's day_of_month
 *   - last_reminded_month is NULL or does not match the current YYYY-MM in user's timezone
 *
 * Dedup: a pending/processing recurring_reminder_send job already exists for this
 *   recurring expense created since UTC midnight → skip enqueue.
 *
 * Safe to call on every worker tick.
 */
async function findRecurringsDueForReminder(db: DbPool): Promise<EligibleRecurring[]> {
  return db<EligibleRecurring[]>`
    SELECT re.id::text, re.user_id::text
    FROM public.recurring_expenses re
    JOIN public.users u ON u.id = re.user_id
    WHERE re.is_active = true
      AND u.is_active = true
      AND u.current_plan_status NOT IN ('expired', 'blocked')
      AND u.timezone <> ''
      AND EXTRACT(DAY FROM (now() AT TIME ZONE u.timezone)) >= re.day_of_month
      AND (
        re.last_reminded_month IS NULL
        OR re.last_reminded_month <> to_char((now() AT TIME ZONE u.timezone)::date, 'YYYY-MM')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.job_queue jq
        WHERE jq.payload_json->>'recurring_id' = re.id::text
          AND jq.job_type = 'recurring_reminder_send'
          AND jq.status   IN ('pending', 'processing')
          AND jq.created_at >= (now()::date)::timestamptz
      )
  `;
}

async function enqueueReminderJob(
  db: DbPool,
  recurringId: string,
  userId: string,
): Promise<void> {
  const payload = { recurring_id: recurringId, user_id: userId };
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('recurring_reminder_send', ${userId}::uuid, ${db.json(payload as any)}, 'pending', now(), 3)
  `;
}

/**
 * Scheduler pass for recurring expense reminders.
 *
 * Finds recurring expenses due for a monthly reminder and enqueues
 * a recurring_reminder_send job for each one.
 *
 * Safe to call on every worker tick — dedup is enforced in SQL.
 */
export async function runRecurringReminderScheduler(
  db: DbPool,
  logger: Logger,
): Promise<void> {
  let items: EligibleRecurring[];

  try {
    items = await findRecurringsDueForReminder(db);
  } catch (err) {
    logger.error({ err }, 'Failed to query recurring expenses for reminder scheduling');
    return;
  }

  if (items.length === 0) return;

  logger.info({ count: items.length }, 'Scheduling recurring reminder jobs');

  for (const item of items) {
    try {
      await enqueueReminderJob(db, item.id, item.userId);
      logger.info({ recurringId: item.id, userId: item.userId }, 'Enqueued recurring_reminder_send job');
    } catch (err) {
      logger.error({ err, recurringId: item.id }, 'Failed to enqueue recurring reminder job');
    }
  }
}
