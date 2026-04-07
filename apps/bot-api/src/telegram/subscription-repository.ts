import type { DbPool } from '@aqsha-ai/database';

/**
 * Creates a trial subscription for a new user if no current subscription exists.
 * Idempotent — safe to call on every incoming message.
 *
 * Uses ON CONFLICT DO NOTHING against the partial unique index
 * uq_subscriptions_current_per_user (user_id WHERE is_current = true).
 *
 * The trg_subscriptions_sync_user_plan trigger automatically updates
 * users.current_plan_status when is_current = true is inserted.
 */
export async function ensureTrialSubscription(
  db: DbPool,
  userId: string,
  trialDays: number,
): Promise<void> {
  await db`
    INSERT INTO subscriptions (
      user_id,
      status,
      is_current,
      trial_start_at,
      trial_end_at
    )
    VALUES (
      ${userId},
      'trial',
      true,
      now(),
      now() + make_interval(days => ${trialDays})
    )
    ON CONFLICT DO NOTHING
  `;
}
