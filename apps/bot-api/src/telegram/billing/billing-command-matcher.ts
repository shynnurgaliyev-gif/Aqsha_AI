/**
 * Recognized billing entry command tokens.
 *
 * Exact-match only — no fuzzy matching.
 * These commands must remain accessible to ALL users, including expired/blocked ones.
 * The check must happen before the subscription access gate.
 */
const BILLING_TOKENS = new Set([
  'оплатить',
  'оплата',
  'подписка',
  'pay',
  'subscription',
  'subscribe',
]);

/**
 * Returns true if the message text is a recognized billing entry command.
 */
export function matchBillingCommand(text: string): boolean {
  return BILLING_TOKENS.has(text.toLowerCase().trim());
}
