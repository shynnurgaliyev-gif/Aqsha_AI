import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramUpdate, TelegramUpdateType } from './types';

/**
 * Central dispatcher for incoming Telegram updates.
 *
 * This is the internal handoff point between the webhook layer and business logic.
 * Currently a placeholder — logs the update and returns.
 *
 * Future routing:
 *   'message'        → text message handler
 *   'voice'          → voice transcription pipeline
 *   'edited_message' → edit handler
 *   'callback_query' → inline keyboard handler
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  updateType: TelegramUpdateType,
  _db: DbPool,
  logger: FastifyBaseLogger,
): Promise<void> {
  logger.info({ updateId: update.update_id, updateType }, 'Telegram update received — routing not yet implemented');

  // TODO: uncomment and implement as handlers are built
  // switch (updateType) {
  //   case 'message':        await handleTextMessage(update, _db, logger); break;
  //   case 'voice':          await handleVoiceMessage(update, _db, logger); break;
  //   case 'edited_message': await handleEditedMessage(update, _db, logger); break;
  //   case 'callback_query': await handleCallbackQuery(update, _db, logger); break;
  // }
}
