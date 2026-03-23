import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

/**
 * Subscription lifecycle check — runs on every worker tick.
 *
 * Transitions current subscriptions to 'expired' when their time window has passed:
 *   - trial:  trial_end_at  IS NOT NULL AND trial_end_at  < now()
 *   - active: paid_until    IS NOT NULL AND paid_until    < now()
 *
 * A single UPDATE statement covers both cases. The existing DB trigger
 * trg_subscriptions_sync_user_plan fires on each updated row and automatically
 * keeps users.current_plan_status aligned — no separate UPDATE is needed.
 *
 * Idempotent: subscriptions already in 'expired' (or any other non-matching)
 * status are not touched.
 *
 * Safe to call on every worker tick.
 */
export async function runSubscriptionLifecycleCheck(db: DbPool, logger: Logger): Promise<void> {
  try {
    const rows = await db<{ user_id: string }[]>`
      UPDATE public.subscriptions
         SET status = 'expired'
       WHERE is_current = true
         AND (
               (status = 'trial'  AND trial_end_at IS NOT NULL AND trial_end_at < now())
            OR (status = 'active' AND paid_until   IS NOT NULL AND paid_until   < now())
             )
      RETURNING user_id
    `;

    if (rows.length > 0) {
      logger.info(
        { count: rows.length, userIds: rows.map((r) => r.user_id) },
        'Subscription lifecycle: subscriptions expired',
      );
    }
  } catch (err) {
    logger.error({ err }, 'Subscription lifecycle check failed');
  }
}
