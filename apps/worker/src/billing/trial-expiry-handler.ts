import type { JobHandler } from '../job-queue/types';
import { sendTelegramMessageWithKeyboard } from '../telegram/sender';

const TRIAL_EXPIRY_TEXT =
  `⏰ Ваш бесплатный период заканчивается сегодня!\n\n` +
  `Все ваши данные сохранены — не теряйте их.\n\n` +
  `Оформите подписку за 1 490 ₸/мес, чтобы продолжить контролировать свои финансы.`;

const PAYWALL_KEYBOARD = {
  inline_keyboard: [[
    { text: '💳 Оплатить 1 490 ₸ через Kaspi', callback_data: 'billing_pay' },
  ]],
};

/**
 * Handles jobs of type 'trial_expiry_reminder'.
 *
 * Sends a reminder on the last day of the trial period, prompting the user
 * to subscribe before losing access.
 */
export const trialExpiryReminderHandler: JobHandler = async (job, ctx) => {
  const { db, env, logger } = ctx;

  const userId = job.user_id ?? (job.payload_json.userId as string | undefined);

  if (!userId) {
    throw new Error('trial_expiry_reminder job is missing user_id');
  }

  const rows = await db<{ telegram_user_id: string; is_active: boolean }[]>`
    SELECT telegram_user_id::text, is_active
      FROM public.users
     WHERE id = ${userId}::uuid
  `;

  const user = rows[0];
  if (!user) throw new Error(`User not found: ${userId}`);
  if (!user.is_active) {
    logger.info({ userId }, 'User inactive — skipping trial expiry reminder');
    return;
  }

  const chatId = Number(user.telegram_user_id);

  await sendTelegramMessageWithKeyboard(
    env.TELEGRAM_BOT_TOKEN,
    chatId,
    TRIAL_EXPIRY_TEXT,
    PAYWALL_KEYBOARD,
    logger,
    env.TELEGRAM_RATE_LIMIT_DELAY_MS,
  );

  logger.info({ userId, chatId }, 'Trial expiry reminder sent');
};
