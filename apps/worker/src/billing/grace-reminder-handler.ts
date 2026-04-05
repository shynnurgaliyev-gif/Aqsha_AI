import type { JobHandler } from '../job-queue/types';
import { sendTelegramMessageWithKeyboard } from '../telegram/sender';

function graceReminderText(daysLeft: number): string {
  const dayWord = daysLeft === 1 ? 'день' : 'дня';
  return (
    `⚠️ Не удалось продлить подписку Aqsha AI.\n\n` +
    `У вас ещё есть доступ — осталось ${daysLeft} ${dayWord}.\n\n` +
    `Оплатите подписку, чтобы не потерять доступ к вашим данным.`
  );
}

const PAYWALL_KEYBOARD = {
  inline_keyboard: [[
    { text: '💳 Оплатить 1 490 ₸ через Kaspi', callback_data: 'billing_pay' },
  ]],
};

/**
 * Handles jobs of type 'grace_reminder_send'.
 *
 * Sends a morning grace period warning via Telegram, with a payment keyboard.
 * daysLeft is read from payload_json (set by grace-scheduler).
 */
export const graceReminderSendHandler: JobHandler = async (job, ctx) => {
  const { db, env, logger } = ctx;

  const userId = job.user_id ?? (job.payload_json.userId as string | undefined);
  const daysLeft = (job.payload_json.daysLeft as number | undefined) ?? 1;

  if (!userId) {
    throw new Error('grace_reminder_send job is missing user_id');
  }

  const rows = await db<{ telegram_user_id: string; is_active: boolean }[]>`
    SELECT telegram_user_id::text, is_active
      FROM public.users
     WHERE id = ${userId}::uuid
  `;

  const user = rows[0];
  if (!user) throw new Error(`User not found: ${userId}`);
  if (!user.is_active) {
    logger.info({ userId }, 'User inactive — skipping grace reminder');
    return;
  }

  const chatId = Number(user.telegram_user_id);
  const text = graceReminderText(daysLeft);

  await sendTelegramMessageWithKeyboard(
    env.TELEGRAM_BOT_TOKEN,
    chatId,
    text,
    PAYWALL_KEYBOARD,
    logger,
    env.TELEGRAM_RATE_LIMIT_DELAY_MS,
  );

  logger.info({ userId, chatId, daysLeft }, 'Grace reminder sent');
};
