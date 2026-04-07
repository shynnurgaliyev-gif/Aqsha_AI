import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramUpdate, TelegramUpdateType } from './types';
import { bootstrapUser } from './user-bootstrap-service';
import { checkSubscriptionAccess, PAYWALL_MESSAGE, PAYWALL_KEYBOARD } from './access-control';
import { matchBillingCommand } from './billing/billing-command-matcher';
import { handleBillingCommand, type BotMessage } from './billing/billing-service';
import {
  handleBillingPayCallback,
  handleBillingPhoneInput,
} from '../billing/billing-service';
import { handleBudgetCommand } from './budgets/budget-handler';
import { matchExportCommand, parseExportCallback, EXPORT_PERIOD_KEYBOARD } from './export/export-matcher';
import { handleExportRequest } from './export/export-handler';
import { sendDocument } from './telegram-client';
import { handleGoalCommand } from './goals/goal-handler';
import { handleCorrectionFlow, handleBulkDeleteCallback, handleDeleteCallback, handleCorrectionCallback } from './transaction-correction/correction-handler';
import { handleRecurringCommand, handleRecurringTimeCallback, handleRecurringRecordCallback, handleRecurringDeleteCallback } from './recurring/recurring-handler';
import { handleResetFlow } from './reset/reset-handler';
import { handleTextMessage, CONFIRMATION_KEYBOARD } from './text-intake/handler';
import { getVoiceTranscript } from './voice-intake/handler';
import { handleAnalyticsQuery } from './analytics/handler';
import { handleChat } from './chat/chat-handler';
import { getChatHistory, setChatHistory } from './chat/chat-session';
import { sendMessage, answerCallbackQuery } from './telegram-client';
import { getPendingDraft, clearPendingDraft, getPendingBulkDraft, clearPendingBulkDraft } from './text-intake/session-draft';
import { insertConfirmedTransaction, insertConfirmedBulkTransactions } from './text-intake/transaction-inserter';
import { getBudgetStatus } from './budgets/budget-repository';
import { formatBudgetAlert } from './budgets/budget-formatter';
import { matchHelpCommand, ONBOARDING_MESSAGE, HELP_MESSAGE } from './help/help-formatter';

/**
 * Full routing pipeline for any text (typed or voice-transcribed).
 * Called after /start, billing command, and access gate checks.
 */
async function dispatchText(
  text: string,
  msg: import('./types').TelegramMessage,
  chatId: number,
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<void> {
  // ── Billing phone input interception ────────────────────────────────────────
  const billingPhoneResponse = await handleBillingPhoneInput(text, userId, db, env, logger);
  if (billingPhoneResponse !== null) {
    logger.info({ userId }, 'Billing phone input handled');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: billingPhoneResponse.text }, logger);
    return;
  }

  // ── Export command ───────────────────────────────────────────────────────────
  if (matchExportCommand(text)) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      text: '📂 За какой период выгрузить историю?',
      reply_markup: EXPORT_PERIOD_KEYBOARD,
    }, logger);
    return;
  }

  // ── Help command ─────────────────────────────────────────────────────────────
  if (matchHelpCommand(text)) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: HELP_MESSAGE }, logger);
    return;
  }

  // ── Budget commands ──────────────────────────────────────────────────────────
  let budgetResponse: string | null = null;
  try {
    budgetResponse = await handleBudgetCommand(text, userId, db, logger);
  } catch (err) {
    logger.error({ err, userId }, 'Budget command error');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: 'Не удалось выполнить команду. Попробуйте позже.' }, logger);
    return;
  }
  if (budgetResponse !== null) {
    logger.info({ userId }, 'Budget command handled');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: budgetResponse }, logger);
    return;
  }

  // ── Goal commands ────────────────────────────────────────────────────────────
  let goalResponse: string | null = null;
  try {
    goalResponse = await handleGoalCommand(text, userId, db, logger);
  } catch (err) {
    logger.error({ err, userId }, 'Goal command error');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: 'Не удалось выполнить команду. Попробуйте позже.' }, logger);
    return;
  }
  if (goalResponse !== null) {
    logger.info({ userId }, 'Goal command handled');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: goalResponse }, logger);
    return;
  }

  // ── Recurring expenses ───────────────────────────────────────────────────────
  let recurringResponse: Awaited<ReturnType<typeof handleRecurringCommand>>;
  try {
    recurringResponse = await handleRecurringCommand(text, userId, db, logger);
  } catch (err) {
    logger.error({ err, userId }, 'Recurring command error');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: 'Не удалось выполнить команду. Попробуйте позже.' }, logger);
    return;
  }
  if (recurringResponse !== null) {
    logger.info({ userId }, 'Recurring command handled');
    if (typeof recurringResponse === 'string') {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: recurringResponse }, logger);
    } else {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chatId,
        text: recurringResponse.message,
        reply_markup: recurringResponse.reply_markup,
      }, logger);
    }
    return;
  }

  // ── Analytics ────────────────────────────────────────────────────────────────
  const analyticsResponse = await handleAnalyticsQuery(text, userId, db, env, logger);
  if (analyticsResponse !== null) {
    logger.info({ userId }, 'Analytics query handled');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: analyticsResponse }, logger);
    return;
  }

  // ── Reset flow ───────────────────────────────────────────────────────────────
  const resetResponse = await handleResetFlow(text, userId, db, logger);
  if (resetResponse !== null) {
    logger.info({ userId }, 'Reset flow handled');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: resetResponse }, logger);
    return;
  }

  // ── Correction flow ──────────────────────────────────────────────────────────
  const correctionResponse = await handleCorrectionFlow(text, userId, db, logger);
  if (correctionResponse !== null) {
    logger.info({ userId }, 'Correction flow handled');
    if (typeof correctionResponse === 'string') {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: correctionResponse }, logger);
    } else {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chatId,
        text: correctionResponse.message,
        reply_markup: correctionResponse.reply_markup,
      }, logger);
    }
    return;
  }

  // ── Text / bulk intake ───────────────────────────────────────────────────────
  const result = await handleTextMessage(msg, userId, db, env, logger);
  logger.info({ userId, resultKind: result.kind }, 'Text message handled');

  if (result.kind === 'unsupported') {
    const history = await getChatHistory(db, userId);
    const { reply: chatReply, updatedHistory } = await handleChat(text, history, env.OPENAI_API_KEY, env.OPENAI_MODEL, logger);
    await setChatHistory(db, userId, updatedHistory);
    const replyWithHint = `${chatReply}\n\n💡 Напиши «помощь» — покажу все команды.`;
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: replyWithHint }, logger);
  } else if (result.kind === 'bulk_confirmation_prompt') {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      text: result.message,
      reply_markup: CONFIRMATION_KEYBOARD,
    }, logger);
  } else if (result.kind === 'bulk_saved') {
    await insertConfirmedBulkTransactions(db, userId, result.items);
    const total = result.items.reduce((sum, i) => sum + i.amount, 0);
    const totalFmt = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      text: `✅ Записано ${result.items.length} операций на ${totalFmt} ₸`,
    }, logger);
  } else if (result.kind === 'confirmation_prompt') {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      text: result.message,
      reply_markup: CONFIRMATION_KEYBOARD,
    }, logger);
  } else if (result.kind === 'transaction_saved') {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: result.message }, logger);
    if (result.savedKind === 'expense') {
      try {
        const budgetStatus = await getBudgetStatus(db, userId, result.savedCategoryId);
        if (budgetStatus && budgetStatus.remaining < 0) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: formatBudgetAlert(budgetStatus) }, logger);
        }
      } catch (err) {
        logger.warn({ err }, 'Budget alert check failed — skipping');
      }
    }
  } else {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: result.message }, logger);
  }
}

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
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: ONBOARDING_MESSAGE }, logger);
          break;
        }

        if (matchBillingCommand(msg.text ?? '')) {
          logger.info({ updateId: update.update_id, userId }, 'Billing command received');
          const billingResponse: BotMessage = await handleBillingCommand(userId, currentPlanStatus, db, env, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, {
            chatId: msg.chat.id,
            text: billingResponse.text,
            ...(billingResponse.reply_markup ? { reply_markup: billingResponse.reply_markup } : {}),
          }, logger);
          break;
        }

        // ── Access gate ────────────────────────────────────────────────────────
        if (checkSubscriptionAccess(currentPlanStatus) === 'blocked') {
          logger.info({ updateId: update.update_id, planStatus: currentPlanStatus }, 'Access blocked — paywall shown');
          await sendMessage(env.TELEGRAM_BOT_TOKEN, {
            chatId: msg.chat.id,
            text: PAYWALL_MESSAGE,
            reply_markup: PAYWALL_KEYBOARD,
          }, logger);
          break;
        }

        await dispatchText(msg.text ?? '', msg, msg.chat.id, userId, db, env, logger);
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

        // Transcribe voice → route through the same full pipeline as text
        const voiceResult = await getVoiceTranscript(msg, userId, env, logger);
        if (!voiceResult.ok) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: voiceResult.errorMessage }, logger);
          break;
        }

        logger.info({ updateId: update.update_id, userId, transcript: voiceResult.transcript }, 'Voice transcribed — routing through full pipeline');
        await dispatchText(voiceResult.transcript, voiceResult.syntheticMessage, msg.chat.id, userId, db, env, logger);
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

        const data = callbackQuery.data;

        // ── Billing pay callback — accessible even when blocked ───────────────
        if (data === 'billing_pay') {
          const billingPayResponse = await handleBillingPayCallback(userId, db, env, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: billingPayResponse.text }, logger);
          break;
        }

        // ── Access gate ──────────────────────────────────────────────────────
        if (checkSubscriptionAccess(currentPlanStatus) === 'blocked') {
          logger.info({ updateId: update.update_id, planStatus: currentPlanStatus }, 'Access blocked — callback query not processed');
          break;
        }

        if (data === 'confirm' || data === 'cancel') {
          // ── Bulk draft takes priority over single draft ──────────────────────
          const bulkDraft = await getPendingBulkDraft(db, userId);
          if (bulkDraft) {
            if (data === 'confirm') {
              await insertConfirmedBulkTransactions(db, userId, bulkDraft.items);
              await clearPendingBulkDraft(db, userId);
              logger.info({ updateId: update.update_id, userId, count: bulkDraft.items.length }, 'Bulk transactions confirmed via inline button');
              const total = bulkDraft.items.reduce((sum, i) => sum + i.amount, 0);
              const totalFmt = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, {
                chatId,
                text: `✅ Записано ${bulkDraft.items.length} операций на ${totalFmt} ₸`,
              }, logger);
              // Budget alerts for expense items
              for (const item of bulkDraft.items) {
                if (item.kind === 'expense') {
                  try {
                    const budgetStatus = await getBudgetStatus(db, userId, item.categoryId);
                    if (budgetStatus && budgetStatus.remaining < 0) {
                      await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: formatBudgetAlert(budgetStatus) }, logger);
                    }
                  } catch (err) {
                    logger.warn({ err }, 'Budget alert check failed — skipping');
                  }
                }
              }
            } else {
              await clearPendingBulkDraft(db, userId);
              logger.info({ updateId: update.update_id, userId }, 'Bulk draft cancelled via inline button');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: '❌ Отменено.' }, logger);
            }
            break;
          }

          // ── Single draft ─────────────────────────────────────────────────────
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
            if (draft.kind === 'expense') {
              try {
                const budgetStatus = await getBudgetStatus(db, userId, draft.categoryId);
                if (budgetStatus && budgetStatus.remaining < 0) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: formatBudgetAlert(budgetStatus) }, logger);
                }
              } catch (err) {
                logger.warn({ err }, 'Budget alert check failed — skipping');
              }
            }
          } else {
            await clearPendingDraft(db, userId);
            logger.info({ updateId: update.update_id, userId }, 'Transaction cancelled via inline button');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: '❌ Отменено.' }, logger);
          }
        } else if (data === 'del_yes' || data === 'del_no') {
          const action = data === 'del_yes' ? 'yes' : 'no';
          const delResult = await handleDeleteCallback(action, userId, db, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: delResult }, logger);
        } else if (data === 'corr_yes' || data === 'corr_no') {
          const action = data === 'corr_yes' ? 'yes' : 'no';
          const corrResult = await handleCorrectionCallback(action, userId, db, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: corrResult }, logger);
        } else if (data === 'bulk_yes' || data === 'bulk_no') {
          const action = data === 'bulk_yes' ? 'yes' : 'no';
          const bulkResult = await handleBulkDeleteCallback(action, userId, db, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: bulkResult }, logger);
        } else if (data && data.startsWith('rec_time:')) {
          const hour = parseInt(data.slice('rec_time:'.length), 10);
          const recTimeResult = await handleRecurringTimeCallback(hour, userId, db, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: recTimeResult }, logger);
        } else if (data && data.startsWith('rec_record:')) {
          const recurringId = data.slice('rec_record:'.length);
          const recRecordResult = await handleRecurringRecordCallback(recurringId, userId, db, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: recRecordResult }, logger);
        } else if (data && data.startsWith('rec_skip:')) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: '✓ Пропущено.' }, logger);
        } else if (data && data.startsWith('rec_del:')) {
          const recurringId = data.slice('rec_del:'.length);
          const recDelResult = await handleRecurringDeleteCallback(recurringId, userId, db, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: recDelResult }, logger);
        } else if (data && parseExportCallback(data) !== null) {
          const period = parseExportCallback(data)!;
          const exportResult = await handleExportRequest(userId, period, db, logger);
          if (!exportResult) {
            await sendMessage(env.TELEGRAM_BOT_TOKEN, {
              chatId,
              text: '📭 Нет данных за выбранный период.',
            }, logger);
          } else {
            await sendDocument(env.TELEGRAM_BOT_TOKEN, {
              chatId,
              fileBuffer: exportResult.buffer,
              filename:   exportResult.filename,
              caption:    exportResult.caption,
            }, logger);
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
