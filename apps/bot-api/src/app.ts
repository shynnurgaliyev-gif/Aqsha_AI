import Fastify, { type FastifyInstance } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';

/**
 * Creates and configures the Fastify application.
 *
 * Does not start listening — call app.listen() from main.ts.
 * This separation makes the app testable without binding a port.
 */
export function createApp(env: AppEnv, _db: DbPool): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: env.APP_NAME,
      env: env.NODE_ENV,
    };
  });

  return app;
}
