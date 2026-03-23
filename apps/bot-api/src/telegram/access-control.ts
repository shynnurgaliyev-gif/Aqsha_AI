/**
 * Subscription access gating for inbound Telegram updates.
 *
 * Reads users.current_plan_status (already returned by bootstrapUser — no extra DB query).
 * Returns 'allowed' or 'blocked' for every possible status value.
 *
 * Status values must match @aqsha-ai/shared SubscriptionStatus and the DB CHECK constraint.
 *
 * Status decisions:
 *   trial    → allowed  — standard trial access
 *   active   → allowed  — paid subscription is current
 *   grace    → allowed  — grace period; access continues until explicitly expired
 *   pending  → allowed  — payment in progress; give benefit of the doubt
 *   expired  → blocked  — trial or subscription period has ended
 *   blocked  → blocked  — account manually blocked by admin
 *   canceled → blocked  — subscription was canceled; user must re-subscribe
 *   unknown  → blocked  — conservative default for any future unrecognised value
 */
export function checkSubscriptionAccess(planStatus: string): 'allowed' | 'blocked' {
  switch (planStatus) {
    case 'trial':
    case 'active':
    case 'grace':
    case 'pending':
      return 'allowed';

    case 'expired':
    case 'blocked':
    case 'canceled':
      return 'blocked';

    default:
      // Unrecognised status — block conservatively
      return 'blocked';
  }
}

/**
 * Stub paywall message shown to users with blocked/expired/canceled subscriptions.
 *
 * Payment integration is not yet implemented. This message will be replaced
 * with a real invoice link when the billing provider is integrated.
 */
export const PAYWALL_MESSAGE =
  'Ваш пробный период завершён.\n\n' +
  'Aqsha AI — 800 ₸/месяц.\n\n' +
  'Оплата будет доступна в ближайшее время. Следите за обновлениями.';
