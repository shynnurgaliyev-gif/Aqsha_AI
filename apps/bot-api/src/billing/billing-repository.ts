import type { DbPool } from '@aqsha-ai/database';

/**
 * Creates a pending payment record when an invoice is issued.
 */
export async function createPendingPayment(
  db: DbPool,
  params: {
    userId: string;
    provider: string;
    invoiceId: string;
    amountKzt: number;
    expiresAt: Date;
  },
): Promise<void> {
  await db`
    INSERT INTO public.payments (user_id, provider, provider_invoice_id, amount_kzt, status, expires_at)
    VALUES (${params.userId}, ${params.provider}, ${params.invoiceId}, ${params.amountKzt}, 'pending', ${params.expiresAt.toISOString()})
  `;
}

/**
 * Looks up the user behind a provider invoice ID.
 * Returns null if not found (duplicate webhook or unknown invoice).
 */
export async function findUserByInvoice(
  db: DbPool,
  provider: string,
  invoiceId: string,
): Promise<{ userId: string; telegramUserId: string } | null> {
  const rows = await db<{ user_id: string; telegram_user_id: string }[]>`
    SELECT p.user_id, u.telegram_user_id::text
      FROM public.payments p
      JOIN public.users u ON u.id = p.user_id
     WHERE p.provider = ${provider}
       AND p.provider_invoice_id = ${invoiceId}
       AND p.status = 'pending'
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { userId: row.user_id, telegramUserId: row.telegram_user_id };
}

/**
 * Activates a paid subscription:
 *   1. Closes the current subscription (is_current = false).
 *   2. Inserts a new 'active' subscription for 30 days.
 *   3. Marks the payment as paid.
 *
 * The DB trigger trg_subscriptions_sync_user_plan automatically updates
 * users.current_plan_status → 'active'.
 */
export async function activateSubscription(
  db: DbPool,
  params: {
    userId: string;
    provider: string;
    invoiceId: string;
    amountKzt: number;
  },
): Promise<void> {
  // Close previous subscription
  await db`
    UPDATE public.subscriptions
       SET is_current = false
     WHERE user_id = ${params.userId}
       AND is_current = true
  `;

  // Insert new active subscription (30 days)
  await db`
    INSERT INTO public.subscriptions
      (user_id, plan_code, status, is_current, paid_from, paid_until, payment_provider, payment_reference, auto_renew)
    VALUES (
      ${params.userId},
      'monthly_kzt_1490',
      'active',
      true,
      now(),
      now() + interval '30 days',
      ${params.provider},
      ${params.invoiceId},
      false
    )
  `;

  // Mark payment as paid
  await db`
    UPDATE public.payments
       SET status   = 'paid',
           paid_at  = now()
     WHERE provider             = ${params.provider}
       AND provider_invoice_id  = ${params.invoiceId}
  `;
}

/**
 * Saves the user's phone number for future Kaspi Pay invoices.
 */
export async function saveUserPhone(db: DbPool, userId: string, phone: string): Promise<void> {
  await db`
    UPDATE public.users SET phone_number = ${phone} WHERE id = ${userId}
  `;
}

/**
 * Returns the stored phone number for a user, or null if not set.
 */
export async function getUserPhone(db: DbPool, userId: string): Promise<string | null> {
  const rows = await db<{ phone_number: string | null }[]>`
    SELECT phone_number FROM public.users WHERE id = ${userId}
  `;
  return rows[0]?.phone_number ?? null;
}
