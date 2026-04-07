import type { JobHandler } from '../job-queue/types';
import { sendTelegramMessageWithKeyboard } from '../telegram/sender';

function formatAmount(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + ' ₸';
}

function buildKeyboard(recurringId: string) {
  return {
    inline_keyboard: [[
      { text: '✅ Записать',   callback_data: `rec_record:${recurringId}` },
      { text: '❌ Пропустить', callback_data: `rec_skip:${recurringId}`   },
    ]],
  };
}

/**
 * Handles jobs of type 'recurring_reminder_send'.
 *
 * Sends a reminder message via Telegram with inline buttons
 * [✅ Записать] and [❌ Пропустить], then updates last_reminded_month.
 */
export const recurringReminderSendHandler: JobHandler = async (job, ctx) => {
  const { db, env, logger } = ctx;

  const userId = job.user_id ?? (job.payload_json.userId as string | undefined);
  const recurringId = job.payload_json.recurringId as string | undefined;
  const description = job.payload_json.description as string | undefined;
  const amount = job.payload_json.amount as number | undefined;

  if (!userId || !recurringId || !description || amount === undefined) {
    throw new Error('recurring_reminder_send job is missing required payload fields');
  }

  const rows = await db<{ telegram_user_id: string; is_active: boolean }[]>`
    SELECT telegram_user_id::text, is_active
    FROM public.users
    WHERE id = ${userId}::uuid
  `;
  const user = rows[0];
  if (!user) throw new Error(`User not found: ${userId}`);
  if (!user.is_active) {
    logger.info({ userId }, 'User inactive — skipping recurring reminder');
    return;
  }

  const chatId = Number(user.telegram_user_id);
  const text =
    `⏰ Напоминание о регулярном расходе:\n\n` +
    `💸 ${description} — ${formatAmount(amount)}\n\n` +
    `Записать расход?`;

  await sendTelegramMessageWithKeyboard(
    env.TELEGRAM_BOT_TOKEN,
    chatId,
    text,
    buildKeyboard(recurringId),
    logger,
    env.TELEGRAM_RATE_LIMIT_DELAY_MS,
  );

  // Mark this month as reminded so the scheduler won't re-enqueue
  await db`
    UPDATE public.recurring_expenses
    SET last_reminded_month = to_char(now(), 'YYYY-MM')
    WHERE id = ${recurringId}::uuid
  `;

  logger.info({ userId, chatId, recurringId, description, amount }, 'Recurring reminder sent');
};
