import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import { BILLING_STUB_RESPONSE } from './billing-formatter';

/**
 * Handles a billing entry command from any user (active, trial, expired, or blocked).
 *
 * Records a 'billing_stub_intent' event in admin_events for conversion tracking.
 * Does NOT change subscription status or grant access.
 * Returns the billing stub response string.
 *
 * The admin_events insert is non-fatal: if it fails, the error is logged and
 * the stub response is still returned to the user.
 */
export async function handleBillingCommand(
  userId: string,
  planStatus: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string> {
  logger.info({ userId, planStatus }, 'Billing stub intent triggered');

  try {
    await db`
      INSERT INTO public.admin_events (user_id, event_type, event_source, severity, event_payload)
      VALUES (
        ${userId}::uuid,
        'billing_stub_intent',
        'bot',
        'info',
        ${JSON.stringify({ plan_status: planStatus })}::jsonb
      )
    `;
  } catch (err) {
    // Non-fatal — logging failure must not block the user-facing response.
    logger.error({ err, userId }, 'Failed to log billing intent to admin_events');
  }

  return BILLING_STUB_RESPONSE;
}
