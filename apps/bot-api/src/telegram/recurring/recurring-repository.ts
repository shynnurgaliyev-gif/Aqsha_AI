import type { DbPool } from '@aqsha-ai/database';

export interface RecurringExpenseRow {
  id: string;
  description: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  dayOfMonth: number;
  reminderHour: number;
  isActive: boolean;
}

export async function insertRecurringExpense(
  db: DbPool,
  userId: string,
  data: {
    description: string;
    categoryId: string;
    categoryName: string;
    amount: number;
    dayOfMonth: number;
    reminderHour: number;
  },
): Promise<RecurringExpenseRow> {
  const rows = await db<RecurringExpenseRow[]>`
    INSERT INTO public.recurring_expenses
      (user_id, description, category_id, category_name, amount, day_of_month, reminder_hour)
    VALUES
      (${userId}::uuid, ${data.description}, ${data.categoryId}::uuid, ${data.categoryName},
       ${data.amount}, ${data.dayOfMonth}, ${data.reminderHour})
    RETURNING
      id::text,
      description,
      category_id::text    AS "categoryId",
      category_name        AS "categoryName",
      amount,
      day_of_month         AS "dayOfMonth",
      reminder_hour        AS "reminderHour",
      is_active            AS "isActive"
  `;
  const row = rows[0];
  if (!row) throw new Error('insertRecurringExpense: no row returned');
  return row;
}

export async function listRecurringExpenses(
  db: DbPool,
  userId: string,
): Promise<RecurringExpenseRow[]> {
  return db<RecurringExpenseRow[]>`
    SELECT
      id::text,
      description,
      category_id::text    AS "categoryId",
      category_name        AS "categoryName",
      amount,
      day_of_month         AS "dayOfMonth",
      reminder_hour        AS "reminderHour",
      is_active            AS "isActive"
    FROM public.recurring_expenses
    WHERE user_id = ${userId}::uuid
      AND is_active = true
    ORDER BY day_of_month, created_at
  `;
}

export async function findRecurringExpenseById(
  db: DbPool,
  id: string,
): Promise<RecurringExpenseRow | null> {
  const rows = await db<RecurringExpenseRow[]>`
    SELECT
      id::text,
      description,
      category_id::text    AS "categoryId",
      category_name        AS "categoryName",
      amount,
      day_of_month         AS "dayOfMonth",
      reminder_hour        AS "reminderHour",
      is_active            AS "isActive"
    FROM public.recurring_expenses
    WHERE id = ${id}::uuid
      AND is_active = true
  `;
  return rows[0] ?? null;
}
