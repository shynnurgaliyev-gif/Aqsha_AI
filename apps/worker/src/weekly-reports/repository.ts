import type { DbPool } from '@aqsha-ai/database';

export interface WeeklyReportUserRecord {
  id: string;
  is_active: boolean;
  current_plan_status: string;
  timezone: string;
}

export interface WeeklyStats {
  weekStartDate: string;   // 'YYYY-MM-DD' Monday of the ISO week
  todayLocalDate: string;  // 'YYYY-MM-DD' today in user's timezone (Sunday)
  thisWeekExpenses: number;
  thisWeekIncome: number;
  lastWeekExpenses: number;
  lastWeekIncome: number;
}

export interface WeekCategoryRow {
  categoryName: string;
  total: number;
}

export interface WeeklyReportRecord {
  id: string;
  user_id: string;
  week_start_date: string;
  message_text: string;
  delivery_status: string;
}

export interface DeliveryUserRecord {
  telegram_user_id: string;
  is_active: boolean;
}

/**
 * Loads the fields needed to validate and generate a weekly report.
 * Returns null if the user does not exist.
 */
export async function findUser(db: DbPool, userId: string): Promise<WeeklyReportUserRecord | null> {
  const rows = await db<WeeklyReportUserRecord[]>`
    SELECT
      id::text,
      is_active,
      current_plan_status,
      timezone
    FROM public.users
    WHERE id = ${userId}::uuid
  `;
  return rows[0] ?? null;
}

/**
 * Computes weekly expense/income totals for the current and previous ISO week.
 * "Current week" = Monday to Sunday (today) in the user's timezone.
 * "Previous week" = the 7 days before that Monday.
 */
export async function calculateWeeklyStats(
  db: DbPool,
  userId: string,
  timezone: string,
): Promise<WeeklyStats> {
  const dateRows = await db<{ week_start: string; today_local: string }[]>`
    SELECT
      date_trunc('week', (now() AT TIME ZONE ${timezone})::date)::date::text AS week_start,
      (now() AT TIME ZONE ${timezone})::date::text AS today_local
  `;
  const { week_start: weekStartDate, today_local: todayLocalDate } = dateRows[0]!;

  const statRows = await db<{
    this_week_expenses: string;
    this_week_income: string;
    last_week_expenses: string;
    last_week_income: string;
  }[]>`
    SELECT
      COALESCE(SUM(CASE
        WHEN kind = 'expense'
          AND transaction_date_local >= ${weekStartDate}::date
          AND transaction_date_local <= ${todayLocalDate}::date
        THEN amount ELSE 0 END), 0) AS this_week_expenses,

      COALESCE(SUM(CASE
        WHEN kind = 'income'
          AND transaction_date_local >= ${weekStartDate}::date
          AND transaction_date_local <= ${todayLocalDate}::date
        THEN amount ELSE 0 END), 0) AS this_week_income,

      COALESCE(SUM(CASE
        WHEN kind = 'expense'
          AND transaction_date_local >= (${weekStartDate}::date - interval '7 days')::date
          AND transaction_date_local <  ${weekStartDate}::date
        THEN amount ELSE 0 END), 0) AS last_week_expenses,

      COALESCE(SUM(CASE
        WHEN kind = 'income'
          AND transaction_date_local >= (${weekStartDate}::date - interval '7 days')::date
          AND transaction_date_local <  ${weekStartDate}::date
        THEN amount ELSE 0 END), 0) AS last_week_income

    FROM public.transactions
    WHERE user_id = ${userId}::uuid
      AND is_deleted = false
      AND parse_status IN ('confirmed', 'corrected')
  `;

  const r = statRows[0]!;
  return {
    weekStartDate,
    todayLocalDate,
    thisWeekExpenses: Number(r.this_week_expenses),
    thisWeekIncome: Number(r.this_week_income),
    lastWeekExpenses: Number(r.last_week_expenses),
    lastWeekIncome: Number(r.last_week_income),
  };
}

/**
 * Returns this week's expense totals per category, sorted by total descending.
 * Capped at 5 rows.
 */
export async function loadTopCategoriesThisWeek(
  db: DbPool,
  userId: string,
  weekStartDate: string,
  todayLocalDate: string,
): Promise<WeekCategoryRow[]> {
  const rows = await db<{ category_name: string; total: string }[]>`
    SELECT c.name AS category_name, SUM(t.amount) AS total
    FROM public.transactions t
    JOIN public.categories c ON c.id = t.category_id
    WHERE t.user_id      = ${userId}::uuid
      AND t.kind         = 'expense'
      AND t.is_deleted   = false
      AND t.parse_status IN ('confirmed', 'corrected')
      AND t.transaction_date_local >= ${weekStartDate}::date
      AND t.transaction_date_local <= ${todayLocalDate}::date
    GROUP BY c.name
    ORDER BY total DESC
    LIMIT 5
  `;
  return rows.map((r) => ({ categoryName: r.category_name, total: Number(r.total) }));
}

/**
 * Inserts a weekly_reports row for the given user and week_start_date.
 * Uses ON CONFLICT DO NOTHING — idempotent.
 *
 * Returns the new report id if inserted, or null if the row already existed.
 */
export async function insertWeeklyReportIfNew(
  db: DbPool,
  userId: string,
  weekStartDate: string,
  messageText: string,
  payloadJson: Record<string, unknown>,
): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    INSERT INTO public.weekly_reports
      (user_id, week_start_date, message_text, payload_json, delivery_status, generated_at)
    VALUES
      (${userId}::uuid, ${weekStartDate}::date, ${messageText}, ${db.json(payloadJson as any)}, 'pending', now())
    ON CONFLICT (user_id, week_start_date) DO NOTHING
    RETURNING id::text
  `;
  return rows[0]?.id ?? null;
}

/**
 * Loads a weekly_reports row by id. Returns null if not found.
 */
export async function findWeeklyReport(
  db: DbPool,
  reportId: string,
): Promise<WeeklyReportRecord | null> {
  const rows = await db<WeeklyReportRecord[]>`
    SELECT
      id::text,
      user_id::text,
      week_start_date::text,
      message_text,
      delivery_status
    FROM public.weekly_reports
    WHERE id = ${reportId}::uuid
  `;
  return rows[0] ?? null;
}

/**
 * Loads minimal user fields needed to deliver a weekly report.
 */
export async function findUserForDelivery(
  db: DbPool,
  userId: string,
): Promise<DeliveryUserRecord | null> {
  const rows = await db<DeliveryUserRecord[]>`
    SELECT telegram_user_id::text, is_active
    FROM public.users
    WHERE id = ${userId}::uuid
  `;
  return rows[0] ?? null;
}

export async function markWeeklyReportSent(db: DbPool, reportId: string): Promise<void> {
  await db`
    UPDATE public.weekly_reports
    SET delivery_status = 'sent', delivered_at = now(), error_text = null
    WHERE id = ${reportId}::uuid
  `;
}

export async function markWeeklyReportFailed(
  db: DbPool,
  reportId: string,
  errorText: string,
): Promise<void> {
  await db`
    UPDATE public.weekly_reports
    SET delivery_status = 'failed', error_text = ${errorText}
    WHERE id = ${reportId}::uuid
  `;
}

export async function markWeeklyReportSkipped(
  db: DbPool,
  reportId: string,
  reason: string,
): Promise<void> {
  await db`
    UPDATE public.weekly_reports
    SET delivery_status = 'skipped', error_text = ${reason}
    WHERE id = ${reportId}::uuid
  `;
}

/**
 * Enqueues a weekly_report_deliver job for the given report.
 */
export async function enqueueWeeklyReportDeliveryJob(
  db: DbPool,
  reportId: string,
  userId: string,
): Promise<void> {
  const payload = { report_id: reportId, user_id: userId };
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('weekly_report_deliver', ${userId}::uuid, ${db.json(payload as any)}, 'pending', now(), 3)
  `;
}
