/**
 * Billing stub response — returned when a user sends a billing entry command
 * (e.g. "оплатить", "подписка", "pay").
 *
 * Replaces a real invoice/payment link until billing integration is implemented.
 * Must not imply payment is currently possible or that access will be unlocked.
 */
export const BILLING_STUB_RESPONSE =
  'Оплата Aqsha AI\n\n' +
  'Тариф: 800 ₸ / месяц\n\n' +
  'Мы работаем над запуском приёма платежей.\n' +
  'Как только оплата станет доступна — вы получите уведомление.';
