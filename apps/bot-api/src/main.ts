import { parseEnv } from '@aqsha-ai/config';
import { createDbPoolFromEnv, closeDbPool } from '@aqsha-ai/database';
import { createApp } from './app';

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

  try {
    await app.listen({ port: env.APP_PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    await closeDbPool(db);
    process.exit(1);
  }
}

void bootstrap();
