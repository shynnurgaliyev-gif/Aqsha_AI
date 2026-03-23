import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramUpdate, TelegramUpdateType } from './types';
import { bootstrapUser } from './user-bootstrap-service';
import { handleTextMessage } from './text-intake/handler';

/**
 * Routes an incoming Telegram update to the appropriate handler stub.
 *
 * For user-originated updates (message, voice, callback_query):
 *   - bootstraps the user (upsert + session + subscription)
 *   - dispatches to the typed handler stub
 *
 * For other update types (edited_message, unknown):
 *   - logs and returns without failure
 *
 * Stub handlers marked with TODO are the next implementation layer.
 */
export async function routeTelegramUpdate(
  update: TelegramUpdate,
  updateType: TelegramUpdateType,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<void> {
  switch (updateType) {
    case 'message': {
      const msg = update.message;
      const from = msg?.from;
      if (msg && from && !from.is_bot) {
        const { userId } = await bootstrapUser(db, env, from);
        const result = await handleTextMessage(msg, userId, db, logger);
        logger.info({ updateId: update.update_id, resultKind: result.kind }, 'Text message handled');
      }
      break;
    }

    case 'voice': {
      const from = update.message?.from;
      if (from && !from.is_bot) {
        await bootstrapUser(db, env, from);
      }
      logger.info({ updateId: update.update_id }, 'Voice message received — handler not yet implemented');
      // TODO: await handleVoiceMessage(update, db, env, logger);
      break;
    }

    case 'callback_query': {
      const from = update.callback_query?.from;
      if (from && !from.is_bot) {
        await bootstrapUser(db, env, from);
      }
      logger.info({ updateId: update.update_id }, 'Callback query received — handler not yet implemented');
      // TODO: await handleCallbackQuery(update, db, env, logger);
      break;
    }

    case 'edited_message': {
      logger.info({ updateId: update.update_id }, 'Edited message received — not handled');
      break;
    }

    default: {
      logger.info({ updateId: update.update_id, updateType }, 'Unsupported update type — ignored');
      break;
    }
  }
}
