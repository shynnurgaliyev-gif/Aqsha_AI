import type { JobHandler } from '../job-queue/types';
import { sendTelegramMessageWithKeyboard } from '../telegram/sender';

const GRACE_FINAL_TEXT =
  `🚨 Последний день! Сегодня закрывается доступ к Aqsha AI.\n\n` +
  `Ваши данные в безопасности — все записи сохранены.\n\n` +
  `Оплатите подписку прямо сейчас, чтобы не прерывать контроль над своими финансами.\n\n` +
  `1 490 ₸/мес — цена одной чашки кофе ☕️`;

const PAYWALL_KEYBOARD = {
  inline_keyboard: [[
    { text: '💳 Оплатить 1 490 ₸ через Kaspi', callback_data: 'billing_pay' },
  ]],
};

/**
 * Handles jobs of type 'grace_final_reminder'.
 *
 * Sends a final warning on the last day of the grace period before
 * the user's access is cut off.
 */
export const graceFinalReminderHandler: JobHandler = async (job, ctx) => {
  const { db, env, logger } = ctx;

  const userId = job.user_id ?? (job.payload_json.userId as string | undefined);

  if (!userId) {
    throw new Error('grace_final_reminder job is missing user_id');
  }

  const rows = await db<{ telegram_user_id: string; is_active: boolean }[]>`
    SELECT telegram_user_id::text, is_active
      FROM public.users
     WHERE id = ${userId}::uuid
  `;

  const user = rows[0];
  if (!user) throw new Error(`User not found: ${userId}`);
  if (!user.is_active) {
    logger.info({ userId }, 'User inactive — skipping grace final reminder');
    return;
  }

  const chatId = Number(user.telegram_user_id);

  await sendTelegramMessageWithKeyboard(
    env.TELEGRAM_BOT_TOKEN,
    chatId,
    GRACE_FINAL_TEXT,
    PAYWALL_KEYBOARD,
    logger,
    env.TELEGRAM_RATE_LIMIT_DELAY_MS,
  );

  logger.info({ userId, chatId }, 'Grace final reminder sent');
};
