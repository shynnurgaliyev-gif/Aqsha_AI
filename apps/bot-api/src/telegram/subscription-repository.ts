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
  // Insert returns RETURNING only when a new row was actually created (no
  // conflict). For existing users this is a no-op and we skip the follow-up
  // UPDATE entirely — saving a round-trip on every inbound message.
  const inserted = await db<Array<{ id: string }>>`
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
    RETURNING id
  `;

  if (inserted.length === 0) return;

  // Newly-created trial — sync users.current_period_end (the DB trigger
  // updates current_plan_status but not the period end).
  await db`
    UPDATE public.users
       SET current_period_end = now() + make_interval(days => ${trialDays})
     WHERE id = ${userId}::uuid
       AND current_period_end IS NULL
  `;
}
