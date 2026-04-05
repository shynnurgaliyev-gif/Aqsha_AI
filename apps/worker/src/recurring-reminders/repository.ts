import type { DbPool } from '@aqsha-ai/database';

export interface RecurringExpenseRow {
  id: string;
  userId: string;
  description: string;
  categoryName: string;
  amount: number;
  dayOfMonth: number;
  isActive: boolean;
}

export interface RecurringDeliveryUserRow {
  telegramUserId: string;
  isActive: boolean;
  timezone: string;
}

/**
 * Loads a recurring expense by id.
 * Returns null if not found.
 */
export async function findRecurringExpense(
  db: DbPool,
  recurringId: string,
): Promise<RecurringExpenseRow | null> {
  const rows = await db<{
    id: string;
    user_id: string;
    description: string;
    category_name: string;
    amount: string;
    day_of_month: number;
    is_active: boolean;
  }[]>`
    SELECT
      id::text, user_id::text, description, category_name,
      amount, day_of_month, is_active
    FROM public.recurring_expenses
    WHERE id = ${recurringId}::uuid
  `;
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    description: r.description,
    categoryName: r.category_name,
    amount: Number(r.amount),
    dayOfMonth: r.day_of_month,
    isActive: r.is_active,
  };
}

/**
 * Loads user info needed to deliver a recurring reminder.
 */
export async function findUserForRecurringDelivery(
  db: DbPool,
  userId: string,
): Promise<RecurringDeliveryUserRow | null> {
  const rows = await db<{ telegram_user_id: string; is_active: boolean; timezone: string }[]>`
    SELECT telegram_user_id::text, is_active, timezone
    FROM public.users
    WHERE id = ${userId}::uuid
  `;
  if (!rows[0]) return null;
  return {
    telegramUserId: rows[0].telegram_user_id,
    isActive: rows[0].is_active,
    timezone: rows[0].timezone,
  };
}

/**
 * Marks the recurring expense as reminded for the current month (in user's timezone).
 * Prevents duplicate reminders within the same month.
 */
export async function markRecurringReminded(
  db: DbPool,
  recurringId: string,
  timezone: string,
): Promise<void> {
  await db`
    UPDATE public.recurring_expenses
    SET
      last_reminded_month = to_char((now() AT TIME ZONE ${timezone})::date, 'YYYY-MM'),
      updated_at          = now()
    WHERE id = ${recurringId}::uuid
  `;
}
