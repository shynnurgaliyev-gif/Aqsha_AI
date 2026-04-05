import type { JobHandler } from '../job-queue/types';
import {
  findRecurringExpense,
  findUserForRecurringDelivery,
  markRecurringReminded,
} from './repository';
import { sendTelegramMessageWithKeyboard } from '../telegram/sender';

function fmt(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

function buildReminderText(description: string, categoryName: string, amount: number): string {
  return (
    `🔔 Напоминание о регулярном расходе:\n\n` +
    `📋 ${description} — ${fmt(amount)}\n` +
    `📁 Категория: ${categoryName}\n\n` +
    `Записать расход за этот месяц?`
  );
}

/**
 * Handles jobs of type 'recurring_reminder_send'.
 *
 * Flow:
 *   1. Load recurring expense — skip if not found or inactive.
 *   2. Load user — throw if not found; skip if inactive.
 *   3. Mark last_reminded_month BEFORE sending to prevent duplicates on retry failures.
 *   4. Send Telegram message with [✅ Записать][❌ Пропустить] inline keyboard.
 *      Callback data: "rec_yes:{id}" / "rec_no:{id}"
 */
export const recurringReminderSendHandler: JobHandler = async (job, ctx) => {
  const { db, env, logger } = ctx;

  // ── 1. Extract recurring_id ───────────────────────────────────────────────
  const recurringId = job.payload_json.recurring_id as string | undefined;
  const userId = job.user_id ?? (job.payload_json.user_id as string | undefined);

  if (!recurringId || !userId) {
    throw new Error('recurring_reminder_send job is missing recurring_id or user_id');
  }

  // ── 2. Load recurring expense ─────────────────────────────────────────────
  const recurring = await findRecurringExpense(db, recurringId);
  if (!recurring) {
    logger.info({ recurringId }, 'Recurring expense not found — skipping reminder');
    return;
  }
  if (!recurring.isActive) {
    logger.info({ recurringId }, 'Recurring expense inactive — skipping reminder');
    return;
  }

  // ── 3. Load user ──────────────────────────────────────────────────────────
  const user = await findUserForRecurringDelivery(db, userId);
  if (!user) {
    throw new Error(`User not found for recurring reminder: ${userId}`);
  }
  if (!user.isActive) {
    logger.info({ recurringId, userId }, 'User inactive — skipping recurring reminder');
    return;
  }

  // ── 4. Mark reminded (before send — prevents duplicate reminders on retry) ──
  await markRecurringReminded(db, recurringId, user.timezone);

  // ── 5. Send reminder via Telegram with inline keyboard ────────────────────
  const chatId = Number(user.telegramUserId);
  const text = buildReminderText(recurring.description, recurring.categoryName, recurring.amount);
  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Записать',   callback_data: `rec_yes:${recurringId}` },
      { text: '❌ Пропустить', callback_data: `rec_no:${recurringId}` },
    ]],
  };

  await sendTelegramMessageWithKeyboard(env.TELEGRAM_BOT_TOKEN, chatId, text, keyboard, logger, env.TELEGRAM_RATE_LIMIT_DELAY_MS);

  logger.info(
    { recurringId, userId, chatId, description: recurring.description },
    'Recurring reminder sent',
  );
};
