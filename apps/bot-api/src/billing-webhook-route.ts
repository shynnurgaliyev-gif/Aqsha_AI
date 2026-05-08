import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { createBillingProvider } from './billing/billing-factory';
import { findUserByInvoice, activateSubscription } from './billing/billing-repository';
import { SUBSCRIPTION_ACTIVATED } from './billing/billing-formatter';
import { sendMessage } from './telegram/telegram-client';

/**
 * Registers POST /webhooks/billing — receives payment confirmation from
 * ApiPay.kz (Kaspi QR) or TipTopPay.
 *
 * Security:
 *   - Verifies HMAC-SHA256 signature (X-Webhook-Signature header).
 *   - Idempotent: duplicate webhooks for already-paid invoices are ignored.
 *   - Always returns 200 so the provider does not retry on our logic errors.
 */
export function createBillingWebhookRoute(env: AppEnv, db: DbPool) {
  return async function (fastify: FastifyInstance): Promise<void> {
    fastify.post(
      '/webhooks/billing',
      {
        // rawBody capture happens in app.ts:addContentTypeParser — no per-route
        // config flag is needed (the previous one was a no-op annotation).
        config: {
          // ApiPay/TipTopPay use a fixed pool of webhook IPs. 30/min per IP
          // is well above any realistic legitimate volume; tighter than the
          // global default to limit blast radius if the webhook secret leaks.
          rateLimit: { max: 30, timeWindow: '1 minute' },
        },
      },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const logger = req.log;

        try {
          const provider = createBillingProvider(env);

          // ── Signature verification ────────────────────────────────────────
          const signature = (req.headers['x-webhook-signature'] as string) ?? '';
          const rawBody   = (req as unknown as { rawBody?: string }).rawBody;

          // Fail-closed: re-serialising req.body would change byte order and
          // whitespace, breaking HMAC verification. If rawBody is missing the
          // contentTypeParser in app.ts did not run — refuse to verify.
          if (typeof rawBody !== 'string' || rawBody.length === 0) {
            logger.error('Billing webhook: rawBody missing — rejecting (server misconfiguration)');
            return reply.status(500).send({ error: 'server misconfiguration' });
          }

          if (!provider.verifyWebhook(rawBody, signature)) {
            logger.warn({ signature }, 'Billing webhook: invalid signature — rejected');
            return reply.status(400).send({ error: 'invalid signature' });
          }

          // ── Parse payload ─────────────────────────────────────────────────
          const payment = provider.parseWebhook(req.body);
          logger.info({ invoiceId: payment.invoiceId, status: payment.status }, 'Billing webhook received');

          if (payment.status !== 'paid') {
            // Not a success event — acknowledge but do nothing
            return reply.send({ ok: true });
          }

          // ── Look up user ──────────────────────────────────────────────────
          const user = await findUserByInvoice(db, env.BILLING_PROVIDER, payment.invoiceId);
          if (!user) {
            logger.warn({ invoiceId: payment.invoiceId }, 'Billing webhook: invoice not found or already processed');
            return reply.send({ ok: true });
          }

          // ── Activate subscription ─────────────────────────────────────────
          await activateSubscription(db, {
            userId:     user.userId,
            provider:   env.BILLING_PROVIDER,
            invoiceId:  payment.invoiceId,
            amountKzt:  payment.amountKzt,
          });

          logger.info({ userId: user.userId, invoiceId: payment.invoiceId }, 'Subscription activated via webhook');

          // ── Notify user via Telegram ──────────────────────────────────────
          try {
            await sendMessage(
              env.TELEGRAM_BOT_TOKEN,
              { chatId: Number(user.telegramUserId), text: SUBSCRIPTION_ACTIVATED },
              logger,
            );
          } catch (err) {
            // Non-fatal — subscription is already activated, notification is cosmetic
            logger.warn({ err, userId: user.userId }, 'Failed to send subscription activation Telegram message');
          }

          return reply.send({ ok: true });
        } catch (err) {
          logger.error({ err }, 'Billing webhook: unexpected error');
          // Return 200 so provider does not retry — we log and investigate manually
          return reply.send({ ok: true });
        }
      },
    );
  };
}
