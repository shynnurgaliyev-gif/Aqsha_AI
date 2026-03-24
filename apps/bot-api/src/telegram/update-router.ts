import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramUpdate, TelegramUpdateType } from './types';
import { bootstrapUser } from './user-bootstrap-service';
import { checkSubscriptionAccess, PAYWALL_MESSAGE } from './access-control';
import { matchBillingCommand } from './billing/billing-command-matcher';
import { handleBillingCommand } from './billing/billing-service';
import { handleCorrectionFlow } from './transaction-correction/correction-handler';
import { handleTextMessage } from './text-intake/handler';
import { handleVoiceMessage } from './voice-intake/handler';
import { handleAnalyticsQuery } from './analytics/handler';
import { sendMessage } from './telegram-client';

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
        const { userId, currentPlanStatus } = await bootstrapUser(db, env, from);

        // ── Billing commands (accessible to all users, including expired) ───────
        // Checked before the access gate so expired users can reach the billing stub.
        if (matchBillingCommand(msg.text ?? '')) {
          logger.info({ updateId: update.update_id, userId }, 'Billing command received');
          const billingResponse = await handleBillingCommand(userId, currentPlanStatus, db, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: billingResponse }, logger);
          break;
        }

        // ── Access gate ────────────────────────────────────────────────────────
        if (checkSubscriptionAccess(currentPlanStatus) === 'blocked') {
          logger.info({ updateId: update.update_id, planStatus: currentPlanStatus }, 'Access blocked — paywall shown');
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: PAYWALL_MESSAGE }, logger);
          break;
        }

        // Analytics queries take priority over correction and text intake.
        // handleAnalyticsQuery returns null if the text is not a recognised query.
        const analyticsResponse = await handleAnalyticsQuery(msg.text ?? '', userId, db, logger);

        if (analyticsResponse !== null) {
          logger.info({ updateId: update.update_id }, 'Analytics query handled');
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: analyticsResponse }, logger);
        } else {
          // Correction flow: handles pending delete confirmation and correction commands.
          // Returns null to fall through to text intake when nothing matches.
          const correctionResponse = await handleCorrectionFlow(msg.text ?? '', userId, db, logger);

          if (correctionResponse !== null) {
            logger.info({ updateId: update.update_id }, 'Correction flow handled');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: correctionResponse }, logger);
          } else {
            const result = await handleTextMessage(msg, userId, db, logger);
            logger.info({ updateId: update.update_id, resultKind: result.kind }, 'Text message handled');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: result.message }, logger);
          }
        }
      }
      break;
    }

    case 'voice': {
      const msg = update.message;
      const from = msg?.from;
      if (msg && from && !from.is_bot) {
        const { userId, currentPlanStatus } = await bootstrapUser(db, env, from);

        // ── Access gate ────────────────────────────────────────────────────────
        if (checkSubscriptionAccess(currentPlanStatus) === 'blocked') {
          logger.info({ updateId: update.update_id, planStatus: currentPlanStatus }, 'Access blocked — paywall shown');
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: PAYWALL_MESSAGE }, logger);
          break;
        }

        const result = await handleVoiceMessage(msg, userId, db, env, logger);
        logger.info({ updateId: update.update_id, resultKind: result.kind }, 'Voice message handled');
        await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: result.message }, logger);
      }
      break;
    }

    case 'callback_query': {
      const from = update.callback_query?.from;
      if (from && !from.is_bot) {
        const { currentPlanStatus } = await bootstrapUser(db, env, from);

        // ── Access gate ────────────────────────────────────────────────────────
        if (checkSubscriptionAccess(currentPlanStatus) === 'blocked') {
          logger.info({ updateId: update.update_id, planStatus: currentPlanStatus }, 'Access blocked — callback query not processed');
          // No reply for callback_query: handler not yet implemented; paywall applied silently.
          break;
        }
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
