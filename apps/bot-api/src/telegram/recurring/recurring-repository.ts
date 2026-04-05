import type { DbPool } from '@aqsha-ai/database';

export interface RecurringExpense {
  id: string;
  userId: string;
  description: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  dayOfMonth: number;
  isActive: boolean;
  lastRemindedMonth: string | null;
}

export async function createRecurringExpense(
  db: DbPool,
  userId: string,
  description: string,
  categoryId: string,
  categoryName: string,
  amount: number,
  dayOfMonth: number,
): Promise<RecurringExpense> {
  const rows = await db<{
    id: string;
    user_id: string;
    description: string;
    category_id: string;
    category_name: string;
    amount: string;
    day_of_month: number;
    is_active: boolean;
    last_reminded_month: string | null;
  }[]>`
    INSERT INTO public.recurring_expenses
      (user_id, description, category_id, category_name, amount, day_of_month)
    VALUES
      (${userId}::uuid, ${description}, ${categoryId}::uuid, ${categoryName}, ${amount}, ${dayOfMonth})
    RETURNING
      id::text, user_id::text, description, category_id::text, category_name,
      amount, day_of_month, is_active, last_reminded_month
  `;
  const r = rows[0]!;
  return {
    id: r.id,
    userId: r.user_id,
    description: r.description,
    categoryId: r.category_id,
    categoryName: r.category_name,
    amount: Number(r.amount),
    dayOfMonth: r.day_of_month,
    isActive: r.is_active,
    lastRemindedMonth: r.last_reminded_month,
  };
}

export async function listRecurringExpenses(
  db: DbPool,
  userId: string,
): Promise<RecurringExpense[]> {
  const rows = await db<{
    id: string;
    user_id: string;
    description: string;
    category_id: string;
    category_name: string;
    amount: string;
    day_of_month: number;
    is_active: boolean;
    last_reminded_month: string | null;
  }[]>`
    SELECT
      id::text, user_id::text, description, category_id::text, category_name,
      amount, day_of_month, is_active, last_reminded_month
    FROM public.recurring_expenses
    WHERE user_id = ${userId}::uuid AND is_active = true
    ORDER BY day_of_month ASC, created_at DESC
    LIMIT 20
  `;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    description: r.description,
    categoryId: r.category_id,
    categoryName: r.category_name,
    amount: Number(r.amount),
    dayOfMonth: r.day_of_month,
    isActive: r.is_active,
    lastRemindedMonth: r.last_reminded_month,
  }));
}

/**
 * Finds the first active recurring expense whose description contains nameQuery (ILIKE).
 * Exact match takes priority.
 */
export async function findRecurringExpenseByName(
  db: DbPool,
  userId: string,
  nameQuery: string,
): Promise<RecurringExpense | null> {
  const normalized = nameQuery.toLowerCase().trim();
  const rows = await db<{
    id: string;
    user_id: string;
    description: string;
    category_id: string;
    category_name: string;
    amount: string;
    day_of_month: number;
    is_active: boolean;
    last_reminded_month: string | null;
  }[]>`
    SELECT
      id::text, user_id::text, description, category_id::text, category_name,
      amount, day_of_month, is_active, last_reminded_month
    FROM public.recurring_expenses
    WHERE user_id = ${userId}::uuid
      AND is_active = true
      AND lower(description) ILIKE ${'%' + normalized + '%'}
    ORDER BY
      CASE WHEN lower(description) = ${normalized} THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    description: r.description,
    categoryId: r.category_id,
    categoryName: r.category_name,
    amount: Number(r.amount),
    dayOfMonth: r.day_of_month,
    isActive: r.is_active,
    lastRemindedMonth: r.last_reminded_month,
  };
}

export async function deleteRecurringExpense(
  db: DbPool,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    UPDATE public.recurring_expenses
    SET is_active = false, updated_at = now()
    WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND is_active = true
    RETURNING id::text
  `;
  return rows.length > 0;
}

/**
 * Loads a recurring expense by id regardless of user.
 * Used by the callback_query handler and the worker.
 */
export async function findRecurringExpenseById(
  db: DbPool,
  id: string,
): Promise<RecurringExpense | null> {
  const rows = await db<{
    id: string;
    user_id: string;
    description: string;
    category_id: string;
    category_name: string;
    amount: string;
    day_of_month: number;
    is_active: boolean;
    last_reminded_month: string | null;
  }[]>`
    SELECT
      id::text, user_id::text, description, category_id::text, category_name,
      amount, day_of_month, is_active, last_reminded_month
    FROM public.recurring_expenses
    WHERE id = ${id}::uuid
  `;
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    description: r.description,
    categoryId: r.category_id,
    categoryName: r.category_name,
    amount: Number(r.amount),
    dayOfMonth: r.day_of_month,
    isActive: r.is_active,
    lastRemindedMonth: r.last_reminded_month,
  };
}

/**
 * Inserts a confirmed transaction from a recurring expense reminder.
 */
export async function insertTransactionFromRecurring(
  db: DbPool,
  userId: string,
  recurring: RecurringExpense,
): Promise<void> {
  await db`
    INSERT INTO transactions (
      user_id, category_id, kind, amount, source_type, source_raw_text, parse_status
    )
    VALUES (
      ${userId}::uuid,
      ${recurring.categoryId}::uuid,
      'expense',
      ${recurring.amount},
      'text',
      ${recurring.description},
      'confirmed'
    )
  `;
}
