import { parseEnv } from '@aqsha-ai/config';
import { createDbPoolFromEnv, closeDbPool } from '@aqsha-ai/database';
import { createWorker } from './app';

async function bootstrap(): Promise<void> {
  const env = parseEnv();
  const db = createDbPoolFromEnv(env);
  const worker = createWorker(env, db);

  const shutdown = async (signal: string): Promise<void> => {
    // Worker's internal logger handles its own shutdown messages.
    // process.stderr is used here because the worker logger may already be closed.
    process.stderr.write(`[worker] Shutdown signal received: ${signal}\n`);
    await worker.stop();
    await closeDbPool(db);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  worker.start();
}

void bootstrap();
