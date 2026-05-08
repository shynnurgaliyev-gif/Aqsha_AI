import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { createWebhookRoute } from './telegram/webhook-route';
import { createBillingWebhookRoute } from './billing-webhook-route';
import { createMiniAppRoute } from './telegram/mini-app/mini-route';

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

  // ── Rate limiting ─────────────────────────────────────────────────────────
  // Defense-in-depth: every endpoint is rate-limited by IP. Per-route configs
  // tighten or relax the budget (see mini-route.ts, billing-webhook-route.ts,
  // and webhook-route.ts). The global default is generous because legitimate
  // Telegram webhook traffic from a single IP can burst.
  void app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    // Avoid hanging requests when the in-memory store hiccups.
    skipOnError: true,
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
  // Exempt from rate limiting — Render's uptime check pings these on a fixed
  // interval and must never be throttled.
  const healthResponse = { status: 'ok', service: env.APP_NAME, env: env.NODE_ENV };
  app.get('/health', { config: { rateLimit: false } }, async () => healthResponse);
  app.get('/', { config: { rateLimit: false } }, async () => healthResponse);

  // ── Telegram webhook ─────────────────────────────────────────────────────────
  void app.register(createWebhookRoute(env, db));

  // ── Billing webhook ───────────────────────────────────────────────────────────
  void app.register(createBillingWebhookRoute(env, db));

  // ── Telegram Mini App API ─────────────────────────────────────────────────────
  void app.register(createMiniAppRoute(env, db));

  return app;
}
