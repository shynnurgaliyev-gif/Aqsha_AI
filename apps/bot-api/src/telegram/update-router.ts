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
import { handleRecurringCommand } from './recurring/recurring-handler';
import { findRecurringExpenseById, insertTransactionFromRecurring } from './recurring/recurring-repository';
import { formatRecurringConfirmed } from './recurring/recurring-formatter';
import { handleCorrectionFlow, handleBulkDeleteCallback } from './transaction-correction/correction-handler';
import { handleResetFlow } from './reset/reset-handler';
import { handleTextMessage, CONFIRMATION_KEYBOARD } from './text-intake/handler';
import { handleVoiceMessage } from './voice-intake/handler';
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

        // ── Billing phone input interception ───────────────────────────────────
        // Must run before analytics/correction so pending phone state is consumed.
        {
          const billingPhoneResponse = await handleBillingPhoneInput(msg.text ?? '', userId, db, env, logger);
          if (billingPhoneResponse !== null) {
            logger.info({ updateId: update.update_id, userId }, 'Billing phone input handled');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: billingPhoneResponse.text }, logger);
            break;
          }
        }

        // ── Export command ─────────────────────────────────────────────────────
        if (matchExportCommand(msg.text ?? '')) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, {
            chatId: msg.chat.id,
            text: '📂 За какой период выгрузить историю?',
            reply_markup: EXPORT_PERIOD_KEYBOARD,
          }, logger);
          break;
        }

        // ── Help command ───────────────────────────────────────────────────────
        if (matchHelpCommand(msg.text ?? '')) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: HELP_MESSAGE }, logger);
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
          let budgetResponse: string | null = null;
          try {
            budgetResponse = await handleBudgetCommand(msg.text ?? '', userId, db, logger);
          } catch (err) {
            logger.error({ err, updateId: update.update_id }, 'Budget command error');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: 'Не удалось выполнить команду. Попробуйте позже.' }, logger);
            break;
          }

          if (budgetResponse !== null) {
            logger.info({ updateId: update.update_id }, 'Budget command handled');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: budgetResponse }, logger);
          } else {
            // Goal commands: create / add_savings / list / show / delete savings goals.
            // Returns null if the text is not a recognised goal command.
            let goalResponse: string | null = null;
            try {
              goalResponse = await handleGoalCommand(msg.text ?? '', userId, db, logger);
            } catch (err) {
              logger.error({ err, updateId: update.update_id }, 'Goal command error');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: 'Не удалось выполнить команду. Попробуйте позже.' }, logger);
              break;
            }

            if (goalResponse !== null) {
              logger.info({ updateId: update.update_id }, 'Goal command handled');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: goalResponse }, logger);
            } else {
              // Recurring expense commands: create / list / delete.
              // Returns null if the text is not a recognised recurring command.
              let recurringResponse: string | null = null;
              try {
                recurringResponse = await handleRecurringCommand(msg.text ?? '', userId, db, env, logger);
              } catch (err) {
                logger.error({ err, updateId: update.update_id }, 'Recurring command error');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: 'Не удалось выполнить команду. Попробуйте позже.' }, logger);
                break;
              }

              if (recurringResponse !== null) {
                logger.info({ updateId: update.update_id }, 'Recurring command handled');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: recurringResponse }, logger);
              } else {
            // Correction flow: handles pending state confirmation and correction commands.
            // Returns null to fall through to text intake when nothing matches.
            const resetResponse = await handleResetFlow(msg.text ?? '', userId, db, logger);
            if (resetResponse !== null) {
              logger.info({ updateId: update.update_id }, 'Reset flow handled');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: resetResponse }, logger);
            } else {

            const correctionResponse = await handleCorrectionFlow(msg.text ?? '', userId, db, logger);

            if (correctionResponse !== null) {
              logger.info({ updateId: update.update_id }, 'Correction flow handled');
              if (typeof correctionResponse === 'string') {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: correctionResponse }, logger);
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, {
                  chatId: msg.chat.id,
                  text: correctionResponse.message,
                  reply_markup: correctionResponse.reply_markup,
                }, logger);
              }
            } else {
              const result = await handleTextMessage(msg, userId, db, env, logger);
              logger.info({ updateId: update.update_id, resultKind: result.kind }, 'Text message handled');

              // When no financial intent was detected, use conversational AI instead
              // of a hardcoded "I don't understand" message.
              if (result.kind === 'unsupported') {
                const history = await getChatHistory(db, userId);
                const { reply: chatReply, updatedHistory } = await handleChat(msg.text ?? '', history, env.OPENAI_API_KEY, env.OPENAI_MODEL, logger);
                await setChatHistory(db, userId, updatedHistory);
                const replyWithHint = `${chatReply}\n\n💡 Напиши «помощь» — покажу все команды.`;
                await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: replyWithHint }, logger);
              } else if (result.kind === 'bulk_confirmation_prompt') {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, {
                  chatId: msg.chat.id,
                  text: result.message,
                  reply_markup: CONFIRMATION_KEYBOARD,
                }, logger);
              } else if (result.kind === 'bulk_saved') {
                // Bulk confirmed via text "да" — insert and report
                await insertConfirmedBulkTransactions(db, userId, result.items);
                const total = result.items.reduce((sum, i) => sum + i.amount, 0);
                const totalFmt = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, {
                  chatId: msg.chat.id,
                  text: `✅ Записано ${result.items.length} операций на ${totalFmt} ₸`,
                }, logger);
              } else if (result.kind === 'confirmation_prompt') {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, {
                  chatId: msg.chat.id,
                  text: result.message,
                  reply_markup: CONFIRMATION_KEYBOARD,
                }, logger);
              } else if (result.kind === 'transaction_saved') {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: result.message }, logger);
                if (result.savedKind === 'expense') {
                  try {
                    const budgetStatus = await getBudgetStatus(db, userId, result.savedCategoryId);
                    if (budgetStatus && budgetStatus.remaining < 0) {
                      await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: formatBudgetAlert(budgetStatus) }, logger);
                    }
                  } catch (err) {
                    logger.warn({ err }, 'Budget alert check failed — skipping');
                  }
                }
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: result.message }, logger);
              }
            }
              }
            }
          }
        }
        } // end reset else
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
        if (result.kind === 'confirmation_prompt') {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, {
            chatId: msg.chat.id,
            text: result.message,
            reply_markup: CONFIRMATION_KEYBOARD,
          }, logger);
        } else {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId: msg.chat.id, text: result.message }, logger);
        }
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
        } else if (data === 'bulk_yes' || data === 'bulk_no') {
          const action = data === 'bulk_yes' ? 'yes' : 'no';
          const bulkResult = await handleBulkDeleteCallback(action, userId, db, logger);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: bulkResult }, logger);
        } else if (data?.startsWith('rec_yes:') || data?.startsWith('rec_no:')) {
          // Recurring expense reminder confirmation.
          const recurringId = data.split(':')[1];
          if (recurringId) {
            const recurring = await findRecurringExpenseById(db, recurringId);
            if (!recurring || !recurring.isActive) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: '⏱ Регулярный расход не найден или уже удалён.' }, logger);
            } else if (data.startsWith('rec_yes:')) {
              await insertTransactionFromRecurring(db, userId, recurring);
              logger.info({ updateId: update.update_id, userId, recurringId }, 'Recurring expense confirmed and transaction inserted');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: formatRecurringConfirmed(recurring) }, logger);
              try {
                const budgetStatus = await getBudgetStatus(db, userId, recurring.categoryId);
                if (budgetStatus && budgetStatus.remaining < 0) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: formatBudgetAlert(budgetStatus) }, logger);
                }
              } catch (err) {
                logger.warn({ err }, 'Budget alert check failed after recurring confirm — skipping');
              }
            } else {
              logger.info({ updateId: update.update_id, userId, recurringId }, 'Recurring expense reminder skipped');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, { chatId, text: '❌ Пропущено. Напомню в следующем месяце.' }, logger);
            }
          }
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
