import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramUpdate, TelegramUpdateType } from './types';
import { bootstrapUser } from './user-bootstrap-service';
import { checkSubscriptionAccess, PAYWALL_MESSAGE } from './access-control';
import { matchBillingCommand } from './billing/billing-command-matcher';
import { handleBillingCommand } from './billing/billing-service';
import { handleBudgetCommand } from './budgets/budget-handler';
import { handleCorrectionFlow } from './transaction-correction/correction-handler';
import { handleTextMessage, CONFIRMATION_KEYBOARD } from './text-intake/handler';
import { handleVoiceMessage } from './voice-intake/handler';
import { handleAnalyticsQuery } from './analytics/handler';
import { handleChat } from './chat/chat-handler';
import { getChatHistory, setChatHistory } from './chat/chat-session';
import { sendMessage, answerCallbackQuery } from './telegram-client';
import { getPendingDraft, clearPendingDraft } from './text-intake/session-draft';
import { insertConfirmedTransaction } from './text-intake/transaction-inserter';

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
        // ── /start command ─────────────────────────────────────────────────────
        // Treat /start as a greeting so the bot responds warmly, not with "unsupported".
        if (msg.text?.trim() === '/start') {
          const { reply: welcome } = await handleChat('/start — пользователь только что открыл бота', [], env.OPENAI_API_KEY, env.OPENAI_MODEL, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: welcome }, logger);
          break;
        }

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
        const analyticsResponse = await handleAnalyticsQuery(msg.text ?? '', userId, db, env, logger);

        if (analyticsResponse !== null) {
          logger.info({ updateId: update.update_id }, 'Analytics query handled');
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: analyticsResponse }, logger);
        } else {
          // Budget commands: set / show / list monthly category budgets.
          // Returns null if the text is not a recognised budget command.
          const budgetResponse = await handleBudgetCommand(msg.text ?? '', userId, db, logger);

          if (budgetResponse !== null) {
            logger.info({ updateId: update.update_id }, 'Budget command handled');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: budgetResponse }, logger);
          } else {
            // Correction flow: handles pending state confirmation and correction commands.
            // Returns null to fall through to text intake when nothing matches.
            const correctionResponse = await handleCorrectionFlow(msg.text ?? '', userId, db, logger);

            if (correctionResponse !== null) {
              logger.info({ updateId: update.update_id }, 'Correction flow handled');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: correctionResponse }, logger);
            } else {
              const result = await handleTextMessage(msg, userId, db, env, logger);
              logger.info({ updateId: update.update_id, resultKind: result.kind }, 'Text message handled');

              // When no financial intent was detected, use conversational AI instead
              // of a hardcoded "I don't understand" message.
              if (result.kind === 'unsupported') {
                const history = await getChatHistory(db, userId);
                const { reply: chatReply, updatedHistory } = await handleChat(msg.text ?? '', history, env.OPENAI_API_KEY, env.OPENAI_MODEL, logger);
                await setChatHistory(db, userId, updatedHistory);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: chatReply }, logger);
              } else if (result.kind === 'confirmation_prompt') {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, {
                  chatId: msg.chat.id,
                  text: result.message,
                  reply_markup: CONFIRMATION_KEYBOARD,
                }, logger);
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: result.message }, logger);
              }
            }
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
      const callbackQuery = update.callback_query;
      const from = callbackQuery?.from;
      const chatId = callbackQuery?.message?.chat.id;

      if (callbackQuery && from && !from.is_bot && chatId) {
        const { userId, currentPlanStatus } = await bootstrapUser(db, env, from);

        // Always answer the callback query to dismiss the button spinner.
        await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, logger);

        // ── Access gate ──────────────────────────────────────────────────────
        if (checkSubscriptionAccess(currentPlanStatus) === 'blocked') {
          logger.info({ updateId: update.update_id, planStatus: currentPlanStatus }, 'Access blocked — callback query not processed');
          break;
        }

        const data = callbackQuery.data;

        if (data === 'confirm' || data === 'cancel') {
          const draft = await getPendingDraft(db, userId);

          if (!draft) {
            // Draft expired or was already handled.
            await sendMessage(env.TELEGRAM_BOT_TOKEN, {
              chatId,
              text: '⏱ Время подтверждения истекло. Отправь транзакцию заново.',
            }, logger);
            break;
          }

          if (data === 'confirm') {
            await insertConfirmedTransaction(db, userId, draft);
            await clearPendingDraft(db, userId);
            logger.info({ updateId: update.update_id, userId, amount: draft.amount }, 'Transaction confirmed via inline button');
            const savedEmoji = draft.kind === 'expense' ? '📤' : '📥';
            const savedLabel = draft.kind === 'expense' ? 'Расход записан' : 'Доход записан';
            const amountFmt = draft.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, {
              chatId,
              text: `${savedEmoji} ${savedLabel}!\n💵 Сумма: ${amountFmt} ₸\n📁 Категория: ${draft.categoryName}`,
            }, logger);
          } else {
            await clearPendingDraft(db, userId);
            logger.info({ updateId: update.update_id, userId }, 'Transaction cancelled via inline button');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: '❌ Отменено.' }, logger);
          }
        } else {
          logger.info({ updateId: update.update_id, data }, 'Unknown callback_query data — ignored');
        }
      }
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
