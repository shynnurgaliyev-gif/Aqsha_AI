import type { DbPool } from '@aqsha-ai/database';

export interface BudgetStatusRow {
  categoryId: string;
  categoryName: string;
  budgetAmount: number;
  spent: number;
  remaining: number;
  yearMonth: string;
}

/**
 * Creates or updates the monthly budget for a user/category/month.
 * Uses to_char(current_date, 'YYYY-MM') as the month key — consistent with
 * the transaction_date_local scoping used across the project.
 *
 * Returns the year_month that was written (e.g. '2026-03').
 */
export async function upsertMonthlyBudget(
  db: DbPool,
  userId: string,
  categoryId: string,
  amount: number,
): Promise<string> {
  const result = await db<{ year_month: string }[]>`
    INSERT INTO public.monthly_budgets (user_id, category_id, year_month, amount)
    VALUES (
      ${userId},
      ${categoryId},
      to_char(current_date, 'YYYY-MM'),
      ${amount}
    )
    ON CONFLICT (user_id, category_id, year_month)
    DO UPDATE SET
      amount     = EXCLUDED.amount,
      updated_at = now()
    RETURNING year_month
  `;
  return result[0]?.year_month ?? '';
}

/**
 * Returns the budget and current-month spending for a specific category.
 *
 * Spending includes confirmed and corrected (but not deleted) expense transactions
 * whose transaction_date_local falls in the current calendar month.
 *
 * Returns null if no budget is set for this user/category in the current month.
 */
export async function getBudgetStatus(
  db: DbPool,
  userId: string,
  categoryId: string,
): Promise<BudgetStatusRow | null> {
  const rows = await db<{
    category_id: string;
    category_name: string;
    budget_amount: string;
    spent: string;
    year_month: string;
  }[]>`
    SELECT
      mb.category_id,
      c.name                     AS category_name,
      mb.amount                  AS budget_amount,
      COALESCE(SUM(t.amount), 0) AS spent,
      mb.year_month
    FROM public.monthly_budgets mb
    JOIN public.categories c ON c.id = mb.category_id
    LEFT JOIN public.transactions t
      ON  t.user_id      = mb.user_id
      AND t.category_id  = mb.category_id
      AND t.kind         = 'expense'
      AND t.is_deleted   = false
      AND t.parse_status IN ('confirmed', 'corrected')
      AND t.transaction_date_local >= date_trunc('month', current_date)::date
      AND t.transaction_date_local <  (date_trunc('month', current_date) + interval '1 month')::date
    WHERE mb.user_id     = ${userId}
      AND mb.category_id = ${categoryId}
      AND mb.year_month  = to_char(current_date, 'YYYY-MM')
    GROUP BY mb.category_id, c.name, mb.amount, mb.year_month
  `;

  const row = rows[0];
  if (!row) return null;

  const budgetAmount = Number(row.budget_amount);
  const spent = Number(row.spent);
  return {
    categoryId: row.category_id,
    categoryName: row.category_name,
    budgetAmount,
    spent,
    remaining: budgetAmount - spent,
    yearMonth: row.year_month,
  };
}

/**
 * Deletes the monthly budget for a user/category in the current month.
 * Returns true if a row was deleted, false if no budget existed.
 */
export async function deleteMonthlyBudget(
  db: DbPool,
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const result = await db<{ id: string }[]>`
    DELETE FROM public.monthly_budgets
    WHERE user_id     = ${userId}
      AND category_id = ${categoryId}
      AND year_month  = to_char(current_date, 'YYYY-MM')
    RETURNING id
  `;
  return result.length > 0;
}

/**
 * Returns all budgets for the current month with spending totals.
 * Sorted alphabetically by category name.
 */
export async function getAllBudgetStatuses(
  db: DbPool,
  userId: string,
): Promise<BudgetStatusRow[]> {
  const rows = await db<{
    category_id: string;
    category_name: string;
    budget_amount: string;
    spent: string;
    year_month: string;
  }[]>`
    SELECT
      mb.category_id,
      c.name                     AS category_name,
      mb.amount                  AS budget_amount,
      COALESCE(SUM(t.amount), 0) AS spent,
      mb.year_month
    FROM public.monthly_budgets mb
    JOIN public.categories c ON c.id = mb.category_id
    LEFT JOIN public.transactions t
      ON  t.user_id      = mb.user_id
      AND t.category_id  = mb.category_id
      AND t.kind         = 'expense'
      AND t.is_deleted   = false
      AND t.parse_status IN ('confirmed', 'corrected')
      AND t.transaction_date_local >= date_trunc('month', current_date)::date
      AND t.transaction_date_local <  (date_trunc('month', current_date) + interval '1 month')::date
    WHERE mb.user_id    = ${userId}
      AND mb.year_month = to_char(current_date, 'YYYY-MM')
    GROUP BY mb.category_id, c.name, mb.amount, mb.year_month
    ORDER BY c.name ASC
  `;

  return rows.map((r) => {
    const budgetAmount = Number(r.budget_amount);
    const spent = Number(r.spent);
    return {
      categoryId: r.category_id,
      categoryName: r.category_name,
      budgetAmount,
      spent,
      remaining: budgetAmount - spent,
      yearMonth: r.year_month,
    };
  });
}
