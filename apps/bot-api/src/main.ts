import { parseEnv } from '@aqsha-ai/config';
import { createDbPoolFromEnv, closeDbPool } from '@aqsha-ai/database';
import { createApp } from './app';
import { setWebhook } from './telegram/webhook-registration';

async function bootstrap(): Promise<void> {
  const env = parseEnv();
  const db = createDbPoolFromEnv(env);
  const app = createApp(env, db);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutdown signal received');
    await app.close();
    await closeDbPool(db);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // ── Webhook registration ─────────────────────────────────────────────────────
  // Register the webhook with Telegram before accepting traffic.
  // Skipped when TELEGRAM_WEBHOOK_URL is not set (local dev / polling mode).
  // Throws and aborts startup on failure — a bot that can't register its webhook
  // cannot receive updates and should not be considered healthy.
  if (env.TELEGRAM_WEBHOOK_URL) {
    app.log.info({ webhookUrl: env.TELEGRAM_WEBHOOK_URL }, 'Registering Telegram webhook');
    try {
      await setWebhook(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_WEBHOOK_URL, env.TELEGRAM_WEBHOOK_SECRET);
      app.log.info('Telegram webhook registered successfully');
    } catch (err) {
      app.log.error(err, 'Failed to register Telegram webhook — aborting startup');
      await closeDbPool(db);
      process.exit(1);
    }
  } else {
    app.log.warn('TELEGRAM_WEBHOOK_URL not set — skipping webhook registration (polling/dev mode)');
  }

  try {
    await app.listen({ port: env.APP_PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    await closeDbPool(db);
    process.exit(1);
  }
}

void bootstrap();
