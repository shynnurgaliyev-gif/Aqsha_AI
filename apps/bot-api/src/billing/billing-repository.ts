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
 *   1. Updates users.current_plan_status → 'active' for 30 days.
 *   2. Marks the payment as paid.
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
  // Activate subscription directly on users table
  await db`
    UPDATE public.users
       SET current_plan_status = 'active',
           current_period_end  = now() + interval '30 days',
           grace_period_end    = NULL,
           updated_at          = now()
     WHERE id = ${params.userId}
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
 * Returns the current subscription end date and status for a user.
 * - trial: end date is current_period_end
 * - active: end date is current_period_end
 * - grace: end date is grace_period_end
 * Returns null if no relevant data found.
 */
export async function getCurrentSubscriptionInfo(
  db: DbPool,
  userId: string,
): Promise<{ endDate: Date; status: string } | null> {
  const rows = await db<{
    current_plan_status: string;
    current_period_end: string | null;
    grace_period_end: string | null;
  }[]>`
    SELECT current_plan_status, current_period_end, grace_period_end
      FROM public.users
     WHERE id = ${userId}
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const status = row.current_plan_status;
  let endDate: Date | null = null;

  if (status === 'grace' && row.grace_period_end) {
    endDate = new Date(row.grace_period_end);
  } else if (row.current_period_end) {
    endDate = new Date(row.current_period_end);
  }

  if (!endDate) return null;
  return { endDate, status };
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
