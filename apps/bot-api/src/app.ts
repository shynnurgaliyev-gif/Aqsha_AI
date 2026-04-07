import Fastify, { type FastifyInstance } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { createWebhookRoute } from './telegram/webhook-route';
import { createBillingWebhookRoute } from './billing-webhook-route';

/**
 * Creates and configures the Fastify application.
 *
 * Does not start listening — call app.listen() from main.ts.
 * This separation makes the app testable without binding a port.
 */
export function createApp(env: AppEnv, db: DbPool): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  // Capture raw request body as string before JSON parsing.
  // Required for HMAC-SHA256 signature verification on billing webhooks —
  // re-serialising with JSON.stringify changes key order and whitespace,
  // which would break the signature check.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      (req as unknown as Record<string, unknown>)['rawBody'] = body;
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── Health ──────────────────────────────────────────────────────────────────
  const healthResponse = { status: 'ok', service: env.APP_NAME, env: env.NODE_ENV };
  app.get('/health', async () => healthResponse);
  app.get('/', async () => healthResponse);       // Render pings root before /health

  // ── Telegram webhook ─────────────────────────────────────────────────────────
  void app.register(createWebhookRoute(env, db));

  // ── Billing webhook ───────────────────────────────────────────────────────────
  void app.register(createBillingWebhookRoute(env, db));

  return app;
}
