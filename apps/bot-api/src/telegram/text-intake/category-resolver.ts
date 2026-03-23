import type { DbPool } from '@aqsha-ai/database';
import type { IntakeKind } from './parser';

export interface ResolvedCategory {
  id: string;
  name: string;
  kind: IntakeKind;
}

/**
 * Resolves a category by normalized name and kind.
 *
 * Resolution order:
 *   1. User's own category (is_system = false, user_id = userId)
 *   2. System category (is_system = true)
 *
 * Kind must match — never returns a category of the wrong kind.
 * Returns null if no matching active category is found.
 *
 * normalized_name is a generated column in the DB: lower(btrim(name)).
 * We normalize the candidate the same way before querying.
 */
export async function resolveCategory(
  db: DbPool,
  userId: string,
  kind: IntakeKind,
  candidate: string,
): Promise<ResolvedCategory | null> {
  const normalized = candidate.toLowerCase().trim();

  // 1. User category
  const userResult = await db<ResolvedCategory[]>`
    SELECT id, name, kind
    FROM categories
    WHERE user_id = ${userId}
      AND kind = ${kind}
      AND is_active = true
      AND normalized_name = ${normalized}
    LIMIT 1
  `;
  if (userResult.length > 0) return userResult[0] ?? null;

  // 2. System category
  const sysResult = await db<ResolvedCategory[]>`
    SELECT id, name, kind
    FROM categories
    WHERE is_system = true
      AND kind = ${kind}
      AND is_active = true
      AND normalized_name = ${normalized}
    LIMIT 1
  `;
  return sysResult[0] ?? null;
}
