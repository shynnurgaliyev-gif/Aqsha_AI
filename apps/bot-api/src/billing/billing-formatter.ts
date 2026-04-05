/**
 * All user-facing billing messages in one place.
 */

/** Shown when user types "оплатить" / "подписка" / etc. */
export const SUBSCRIPTION_INFO =
  `💎 Aqsha AI — ваш личный финансовый помощник\n\n` +
  `Мы убеждены: это лучший инструмент для контроля бюджета в Казахстане.\n` +
  `Каждый день бот помогает вам видеть куда уходят деньги, и экономить тысячи тенге.\n\n` +
  `Стоимость подписки: 1 490 ₸/месяц\n` +
  `Это как одна чашка кофе ☕️ — но взамен вы экономите в разы больше 🚀\n\n` +
  `✅ 7 дней бесплатно для новых пользователей\n` +
  `✅ Все данные сохраняются\n` +
  `✅ Отмена в любой момент`;

/** Inline keyboard under SUBSCRIPTION_INFO */
export function SUBSCRIPTION_INFO_KEYBOARD(testMode: boolean): object {
  if (testMode) {
    return {
      inline_keyboard: [[
        { text: '🧪 Тест оплаты (активировать)', callback_data: 'billing_pay' },
      ]],
    };
  }
  return {
    inline_keyboard: [[
      { text: '💳 Оплатить 1 490 ₸ через Kaspi', callback_data: 'billing_pay' },
    ]],
  };
}

/** Shown to expired users (paywall) */
export const PAYWALL_TEXT =
  `⏰ Ваш пробный период завершён.\n\n` +
  `Все ваши данные сохранены и ждут вас.\n\n` +
  `Aqsha AI — это инвестиция в себя:\n` +
  `1 490 ₸/мес (цена одной чашки кофе ☕️),\n` +
  `а экономия — тысячи тенге каждый месяц 🚀\n\n` +
  `Возобновите подписку, чтобы продолжить.`;

/** Inline keyboard shown with paywall */
export const PAYWALL_KEYBOARD = {
  inline_keyboard: [[
    { text: '💳 Оплатить 1 490 ₸ через Kaspi', callback_data: 'billing_pay' },
  ]],
};

/** Shown when bot asks for phone number */
export const ASK_PHONE =
  `📱 Введите номер телефона для отправки счёта в Kaspi:\n\n` +
  `Формат: 87001234567 или +77001234567`;

/** Shown when phone format is invalid */
export const INVALID_PHONE =
  `❌ Неверный формат номера.\n\n` +
  `Введите номер в формате: 87001234567`;

/** Shown after invoice is successfully sent to Kaspi */
export const INVOICE_SENT =
  `✅ Счёт на 1 490 ₸ отправлен в ваше приложение Kaspi!\n\n` +
  `Откройте Kaspi → уведомление о счёте → подтвердите оплату.\n\n` +
  `Доступ откроется автоматически сразу после оплаты.`;

/** Shown after webhook confirms payment (sent from webhook route) */
export const SUBSCRIPTION_ACTIVATED =
  `🎉 Подписка активирована!\n\n` +
  `Добро пожаловать в Aqsha AI.\n` +
  `Ваш личный финансовый помощник снова с вами на 30 дней.\n\n` +
  `Просто отправьте сообщение — я слушаю 👂`;

/** Shown in test mode after fake payment */
export const TEST_ACTIVATED =
  `🧪 Тестовый режим: подписка активирована на 30 дней!\n\n` +
  `В продакшне здесь будет реальный Kaspi счёт.`;

/** Shown on day 1 of grace period */
export function GRACE_REMINDER(daysLeft: number): string {
  return (
    `⚠️ Не удалось продлить подписку Aqsha AI.\n\n` +
    `У вас ещё есть доступ — осталось ${daysLeft} ${daysLeft === 1 ? 'день' : 'дня'}.\n\n` +
    `Оплатите подписку, чтобы не потерять доступ к вашим данным.`
  );
}
