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
