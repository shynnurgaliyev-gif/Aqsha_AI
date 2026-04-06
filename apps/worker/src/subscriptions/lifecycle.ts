import type { DbPool } from '@aqsha-ai/database';
import type { Logger } from 'pino';

/**
 * Subscription lifecycle check — runs on every worker tick.
 *
 * Transitions:
 *   trial  + trial_end_at < now()              → expired
 *   active + paid_until   < now()              → grace   (3-day grace period starts)
 *   grace  + paid_until + 3 days < now()       → expired (grace period over)
 *
 * The existing DB trigger trg_subscriptions_sync_user_plan fires on each updated
 * row and automatically keeps users.current_plan_status aligned.
 *
 * Idempotent — safe to call on every worker tick.
 */
export async function runSubscriptionLifecycleCheck(db: DbPool, logger: Logger): Promise<void> {
  try {
    // ── Trial → expired ───────────────────────────────────────────────────────
    const trialExpired = await db<{ id: string }[]>`
      UPDATE public.users
         SET current_plan_status = 'expired',
             updated_at = now()
       WHERE current_plan_status = 'trial'
         AND current_period_end IS NOT NULL
         AND current_period_end < now()
         AND is_active = true
      RETURNING id
    `;

    if (trialExpired.length > 0) {
      logger.info(
        { count: trialExpired.length, userIds: trialExpired.map((r) => r.id) },
        'Subscription lifecycle: trial subscriptions expired',
      );
    }

    // ── Active → grace (paid_until passed, grace period begins) ───────────────
    const movedToGrace = await db<{ id: string }[]>`
      UPDATE public.users
         SET current_plan_status = 'grace',
             grace_period_end    = current_period_end + interval '3 days',
             updated_at          = now()
       WHERE current_plan_status = 'active'
         AND current_period_end IS NOT NULL
         AND current_period_end < now()
         AND is_active = true
      RETURNING id
    `;

    if (movedToGrace.length > 0) {
      logger.info(
        { count: movedToGrace.length, userIds: movedToGrace.map((r) => r.id) },
        'Subscription lifecycle: subscriptions moved to grace period',
      );
    }

    // ── Grace → expired (grace period is over) ────────────────────────────────
    const graceExpired = await db<{ id: string }[]>`
      UPDATE public.users
         SET current_plan_status = 'expired',
             updated_at          = now()
       WHERE current_plan_status = 'grace'
         AND grace_period_end IS NOT NULL
         AND grace_period_end < now()
         AND is_active = true
      RETURNING id
    `;

    if (graceExpired.length > 0) {
      logger.info(
        { count: graceExpired.length, userIds: graceExpired.map((r) => r.id) },
        'Subscription lifecycle: grace period subscriptions expired',
      );
    }
    // ── Expired pending payments cleanup ──────────────────────────────────────
    // Kaspi QR invoices expire after 15 minutes. Any payment still pending
    // past its expires_at is stale — mark it expired so it doesn't block
    // future invoice creation for the same user.
    const expiredPayments = await db<{ id: string }[]>`
      UPDATE public.payments
         SET status = 'expired'
       WHERE status     = 'pending'
         AND expires_at IS NOT NULL
         AND expires_at < now()
      RETURNING id
    `;

    if (expiredPayments.length > 0) {
      logger.info(
        { count: expiredPayments.length },
        'Subscription lifecycle: stale pending payments expired',
      );
    }
  } catch (err) {
    logger.error({ err }, 'Subscription lifecycle check failed');
  }
}
