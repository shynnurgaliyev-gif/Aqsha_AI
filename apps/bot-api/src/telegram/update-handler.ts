import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramUpdate, TelegramUpdateType } from './types';
import { routeTelegramUpdate } from './update-router';

/**
 * Central entry point for incoming Telegram updates after deduplication.
 *
 * Delegates to routeTelegramUpdate which handles:
 *   - user bootstrap (upsert + session + trial subscription)
 *   - routing by update type to typed handler stubs
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  updateType: TelegramUpdateType,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<void> {
  await routeTelegramUpdate(update, updateType, db, env, logger);
}
