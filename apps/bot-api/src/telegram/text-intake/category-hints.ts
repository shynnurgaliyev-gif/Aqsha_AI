import type { DbPool } from '@aqsha-ai/database';
import { normalizeCandidate, type ResolvedCategory } from './category-resolver';
import type { IntakeKind } from './parser';

/**
 * Looks up a cached category resolution.
 * Returns null on cache miss or DB error (safe fallback — caller proceeds to resolveCategory).
 */
export async function getCategoryHint(
  db: DbPool,
  userId: string,
  candidate: string,
  kind: IntakeKind,
): Promise<ResolvedCategory | null> {
  const key = normalizeCandidate(candidate);
  const rows = await db<{ id: string; name: string }[]>`
    SELECT category_id::text AS id, category_name AS name
    FROM public.category_hints
    WHERE user_id = ${userId}::uuid
      AND candidate = ${key}
      AND kind      = ${kind}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return { id: rows[0].id, name: rows[0].name, kind };
}

/**
 * Saves a resolved category to the cache.
 * Uses ON CONFLICT DO UPDATE to refresh category_name if the category was renamed.
 * Errors are silently ignored — cache write failure must never break the main flow.
 */
export async function setCategoryHint(
  db: DbPool,
  userId: string,
  candidate: string,
  kind: IntakeKind,
  categoryId: string,
  categoryName: string,
): Promise<void> {
  const key = normalizeCandidate(candidate);
  await db`
    INSERT INTO public.category_hints (user_id, candidate, kind, category_id, category_name)
    VALUES (${userId}::uuid, ${key}, ${kind}, ${categoryId}::uuid, ${categoryName})
    ON CONFLICT (user_id, candidate, kind)
    DO UPDATE SET category_name = ${categoryName}, category_id = ${categoryId}::uuid
  `;
}
