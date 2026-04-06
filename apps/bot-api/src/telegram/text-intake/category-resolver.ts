import type { DbPool } from '@aqsha-ai/database';
import type { IntakeKind } from './parser';

export interface ResolvedCategory {
  id: string;
  name: string;
  kind: IntakeKind;
}

/**
 * Normalizes a category candidate string for consistent lookup.
 * Applies: lowercase → ё→е → collapse whitespace → trim.
 * Used identically for category_hints, categories, and category_aliases lookups.
 */
export function normalizeCandidate(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves a category candidate to a category row.
 *
 * Resolution order:
 *   1. User's own category — exact normalized_name match
 *   2. System category    — exact normalized_name match
 *   3. Alias lookup       — category_aliases.normalized_alias match
 *
 * Kind must match — never returns a category of the wrong kind.
 * Returns null if no matching active category is found.
 */
export async function resolveCategory(
  db: DbPool,
  userId: string,
  kind: IntakeKind,
  candidate: string,
): Promise<ResolvedCategory | null> {
  const normalized = normalizeCandidate(candidate);

  // 1. User's own category
  const userResult = await db<ResolvedCategory[]>`
    SELECT id, name, kind
    FROM public.categories
    WHERE user_id = ${userId}
      AND kind = ${kind}
      AND is_active = true
      AND normalized_name = ${normalized}
    LIMIT 1
  `;
  if (userResult.length > 0) return userResult[0] ?? null;

  // 2. System category — exact name match
  const sysResult = await db<ResolvedCategory[]>`
    SELECT id, name, kind
    FROM public.categories
    WHERE is_system = true
      AND kind = ${kind}
      AND is_active = true
      AND normalized_name = ${normalized}
    LIMIT 1
  `;
  if (sysResult.length > 0) return sysResult[0] ?? null;

  // 3. Alias lookup — check category_aliases
  const aliasResult = await db<ResolvedCategory[]>`
    SELECT c.id, c.name, c.kind
    FROM public.category_aliases ca
    JOIN public.categories c ON c.id = ca.category_id
    WHERE c.kind = ${kind}
      AND c.is_active = true
      AND ca.normalized_alias = ${normalized}
    LIMIT 1
  `;
  return aliasResult[0] ?? null;
}

/**
 * Saves a candidate as a non-system alias for a category (fire-and-forget).
 * Called after a successful AI resolve where the original candidate
 * did not match the category name directly.
 * Errors are silently ignored — alias write failure must never break the main flow.
 */
export function saveAliasIfNew(
  db: DbPool,
  categoryId: string,
  candidate: string,
): void {
  const normalized = normalizeCandidate(candidate);
  db`
    INSERT INTO public.category_aliases (category_id, alias, normalized_alias, is_system)
    VALUES (${categoryId}::uuid, ${candidate}, ${normalized}, false)
    ON CONFLICT (category_id, normalized_alias) DO NOTHING
  `.catch(() => undefined);
}
