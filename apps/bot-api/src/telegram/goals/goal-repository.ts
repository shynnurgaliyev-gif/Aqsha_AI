import type { DbPool } from '@aqsha-ai/database';

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  isCompleted: boolean;
}

export async function createGoal(
  db: DbPool,
  userId: string,
  name: string,
  targetAmount: number,
): Promise<SavingsGoal | 'already_exists'> {
  const normalizedName = name.toLowerCase().trim();
  const rows = await db<{ id: string; name: string; target_amount: string; saved_amount: string; is_completed: boolean }[]>`
    INSERT INTO public.savings_goals (user_id, name, normalized_name, target_amount)
    VALUES (${userId}, ${name}, ${normalizedName}, ${targetAmount})
    ON CONFLICT (user_id, normalized_name) DO NOTHING
    RETURNING id::text, name, target_amount, saved_amount, is_completed
  `;
  if (rows.length === 0) return 'already_exists';
  const r = rows[0]!;
  return { id: r.id, name: r.name, targetAmount: Number(r.target_amount), savedAmount: Number(r.saved_amount), isCompleted: r.is_completed };
}

/**
 * Finds a goal by partial name match (exact first, then ILIKE).
 * Only returns active (not completed) goals.
 */
export async function findGoalByName(
  db: DbPool,
  userId: string,
  nameQuery: string,
): Promise<SavingsGoal | null> {
  const normalized = nameQuery.toLowerCase().trim();
  const rows = await db<{ id: string; name: string; target_amount: string; saved_amount: string; is_completed: boolean }[]>`
    SELECT id::text, name, target_amount, saved_amount, is_completed
    FROM public.savings_goals
    WHERE user_id = ${userId}
      AND is_completed = false
      AND normalized_name ILIKE ${'%' + normalized + '%'}
    ORDER BY
      CASE WHEN normalized_name = ${normalized} THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const r = rows[0];
  return { id: r.id, name: r.name, targetAmount: Number(r.target_amount), savedAmount: Number(r.saved_amount), isCompleted: r.is_completed };
}

/**
 * Adds amount to saved_amount. Marks is_completed = true if target reached.
 * Returns the updated goal.
 */
export async function addSavingsToGoal(
  db: DbPool,
  goalId: string,
  userId: string,
  amount: number,
): Promise<SavingsGoal> {
  const rows = await db<{ id: string; name: string; target_amount: string; saved_amount: string; is_completed: boolean }[]>`
    UPDATE public.savings_goals
    SET
      saved_amount = LEAST(saved_amount + ${amount}, target_amount),
      is_completed = (saved_amount + ${amount} >= target_amount),
      updated_at   = now()
    WHERE id = ${goalId}::uuid AND user_id = ${userId}
    RETURNING id::text, name, target_amount, saved_amount, is_completed
  `;
  const r = rows[0]!;
  return { id: r.id, name: r.name, targetAmount: Number(r.target_amount), savedAmount: Number(r.saved_amount), isCompleted: r.is_completed };
}

export async function listGoals(db: DbPool, userId: string): Promise<SavingsGoal[]> {
  const rows = await db<{ id: string; name: string; target_amount: string; saved_amount: string; is_completed: boolean }[]>`
    SELECT id::text, name, target_amount, saved_amount, is_completed
    FROM public.savings_goals
    WHERE user_id = ${userId}
    ORDER BY is_completed ASC, created_at DESC
    LIMIT 10
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    targetAmount: Number(r.target_amount),
    savedAmount: Number(r.saved_amount),
    isCompleted: r.is_completed,
  }));
}

/**
 * Deletes a goal. Returns true if deleted, false if not found.
 */
export async function deleteGoal(db: DbPool, userId: string, goalId: string): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    DELETE FROM public.savings_goals
    WHERE id = ${goalId}::uuid AND user_id = ${userId}
    RETURNING id::text
  `;
  return rows.length > 0;
}
