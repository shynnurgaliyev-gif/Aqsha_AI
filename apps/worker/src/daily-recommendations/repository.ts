import type { DbPool } from '@aqsha-ai/database';

export interface UserRecord {
  id: string;
  is_active: boolean;
  current_plan_status: string;
  daily_recommendations_enabled: boolean;
  timezone: string;
}

export interface DailyStats {
  balance: number;
  monthExpenses: number;
  monthIncome: number;
  todayLocalDate: string; // 'YYYY-MM-DD' in user's timezone
}

export interface RecommendationRecord {
  id: string;
  user_id: string;
  recommendation_date_local: string;
  message_text: string;
  delivery_status: string;
}

export interface DeliveryUserRecord {
  telegram_user_id: string; // bigint — returned as string by postgres.js; cast to Number before use
  is_active: boolean;
}

/**
 * Loads the fields needed to validate and generate a daily recommendation.
 * Returns null if the user does not exist.
 */
export async function findUser(db: DbPool, userId: string): Promise<UserRecord | null> {
  const rows = await db<UserRecord[]>`
    SELECT
      id::text,
      is_active,
      current_plan_status,
      daily_recommendations_enabled,
      timezone
    FROM public.users
    WHERE id = ${userId}
  `;
  return rows[0] ?? null;
}

/**
 * Computes balance, current-month expense/income totals, and today's local date
 * for a user. Uses only confirmed, non-deleted transactions.
 * Monthly scope is derived from the user's timezone.
 */
export async function calculateDailyStats(
  db: DbPool,
  userId: string,
  timezone: string,
): Promise<DailyStats> {
  // Resolve today's local date in the user's timezone
  const dateRows = await db<{ today_local: string }[]>`
    SELECT (now() AT TIME ZONE ${timezone})::date::text AS today_local
  `;
  const todayLocalDate = dateRows[0]!.today_local;

  // Aggregate confirmed, non-deleted transactions
  const statRows = await db<{ balance: string; month_expenses: string; month_income: string }[]>`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0)
        AS balance,

      COALESCE(SUM(CASE
        WHEN kind = 'expense'
          AND transaction_date_local >= date_trunc('month', (now() AT TIME ZONE ${timezone})::date)::date
          AND transaction_date_local <  (date_trunc('month', (now() AT TIME ZONE ${timezone})::date) + interval '1 month')::date
        THEN amount ELSE 0 END), 0) AS month_expenses,

      COALESCE(SUM(CASE
        WHEN kind = 'income'
          AND transaction_date_local >= date_trunc('month', (now() AT TIME ZONE ${timezone})::date)::date
          AND transaction_date_local <  (date_trunc('month', (now() AT TIME ZONE ${timezone})::date) + interval '1 month')::date
        THEN amount ELSE 0 END), 0) AS month_income

    FROM public.transactions
    WHERE user_id = ${userId}
      AND is_deleted = false
      AND parse_status = 'confirmed'
  `;

  const row = statRows[0]!;
  return {
    balance: Number(row.balance),
    monthExpenses: Number(row.month_expenses),
    monthIncome: Number(row.month_income),
    todayLocalDate,
  };
}

/**
 * Inserts a daily recommendation row for the given user and local date.
 * Uses ON CONFLICT DO NOTHING so it is safe to retry.
 *
 * Returns the new recommendation id (uuid string) if inserted,
 * or null if a row already existed for this user+date.
 */
export async function insertRecommendationIfNew(
  db: DbPool,
  userId: string,
  dateLocal: string,
  messageText: string,
  payloadJson: Record<string, unknown>,
): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    INSERT INTO public.daily_recommendations
      (user_id, recommendation_date_local, message_text, payload_json, delivery_status, generated_at)
    VALUES
      (${userId}, ${dateLocal}::date, ${messageText}, ${db.json(payloadJson as any)}, 'pending', now())
    ON CONFLICT (user_id, recommendation_date_local) DO NOTHING
    RETURNING id::text
  `;
  return rows[0]?.id ?? null;
}

/**
 * Loads a daily_recommendations row by id.
 * Returns null if not found.
 */
export async function findRecommendation(
  db: DbPool,
  recommendationId: string,
): Promise<RecommendationRecord | null> {
  const rows = await db<RecommendationRecord[]>`
    SELECT
      id::text,
      user_id::text,
      recommendation_date_local::text,
      message_text,
      delivery_status
    FROM public.daily_recommendations
    WHERE id = ${recommendationId}::uuid
  `;
  return rows[0] ?? null;
}

/**
 * Loads the minimal user fields needed to deliver a recommendation.
 * Returns null if the user does not exist.
 *
 * telegram_user_id is the Telegram chat_id for private-bot delivery.
 */
export async function findUserForDelivery(
  db: DbPool,
  userId: string,
): Promise<DeliveryUserRecord | null> {
  const rows = await db<DeliveryUserRecord[]>`
    SELECT
      telegram_user_id::text,
      is_active
    FROM public.users
    WHERE id = ${userId}::uuid
  `;
  return rows[0] ?? null;
}

/**
 * Sets delivery_status='sent' and records the delivery timestamp.
 * Clears any previous error_text from a prior failed attempt.
 */
export async function markRecommendationSent(
  db: DbPool,
  recommendationId: string,
): Promise<void> {
  await db`
    UPDATE public.daily_recommendations
    SET
      delivery_status = 'sent',
      delivered_at    = now(),
      error_text      = null
    WHERE id = ${recommendationId}::uuid
  `;
}

/**
 * Sets delivery_status='failed' and records the error reason in error_text.
 */
export async function markRecommendationFailed(
  db: DbPool,
  recommendationId: string,
  errorText: string,
): Promise<void> {
  await db`
    UPDATE public.daily_recommendations
    SET
      delivery_status = 'failed',
      error_text      = ${errorText}
    WHERE id = ${recommendationId}::uuid
  `;
}

/**
 * Sets delivery_status='skipped' and records the reason in error_text.
 */
export async function markRecommendationSkipped(
  db: DbPool,
  recommendationId: string,
  reason: string,
): Promise<void> {
  await db`
    UPDATE public.daily_recommendations
    SET
      delivery_status = 'skipped',
      error_text      = ${reason}
    WHERE id = ${recommendationId}::uuid
  `;
}

/**
 * Enqueues a daily_recommendation_deliver job for the given recommendation.
 * Called immediately after a new recommendation row is created.
 */
export async function enqueueDeliveryJob(
  db: DbPool,
  recommendationId: string,
  userId: string,
): Promise<void> {
  const payload = { recommendation_id: recommendationId, user_id: userId };
  await db`
    INSERT INTO public.job_queue
      (job_type, user_id, payload_json, status, run_after, max_attempts)
    VALUES
      ('daily_recommendation_deliver', ${userId}::uuid, ${db.json(payload as any)}, 'pending', now(), 3)
  `;
}
