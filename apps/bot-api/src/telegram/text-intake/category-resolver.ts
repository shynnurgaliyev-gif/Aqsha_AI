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
 * Maps common Russian declined forms of category names to their nominative (canonical) form.
 * Covers accusative, dative, genitive, locative cases for all system categories.
 * Used when a category candidate is extracted from free-form phrases like
 * "сколько потратил на еду" (еду → еда) or "бюджет на аренду" (аренду → аренда).
 */
const CATEGORY_FORM_MAP: Record<string, string> = {
  // Еда
  'еду': 'еда',
  'еде': 'еда',
  'еды': 'еда',

  // Кафе — does not decline, but keep for consistency
  'кафе': 'кафе',

  // Кофе — does not decline
  'кофе': 'кофе',

  // Транспорт
  'транспорту': 'транспорт',
  'транспорта': 'транспорт',
  'транспортом': 'транспорт',

  // Такси — does not decline

  // Бензин
  'бензину': 'бензин',
  'бензина': 'бензин',
  'бензином': 'бензин',

  // Коммуналка
  'коммуналку': 'коммуналка',
  'коммуналке': 'коммуналка',
  'коммуналки': 'коммуналка',

  // Аренда
  'аренду': 'аренда',
  'аренде': 'аренда',
  'аренды': 'аренда',

  // Связь
  'связи': 'связь',
  'связью': 'связь',

  // Здоровье
  'здоровью': 'здоровье',
  'здоровья': 'здоровье',

  // Одежда
  'одежду': 'одежда',
  'одежде': 'одежда',
  'одежды': 'одежда',

  // Развлечения
  'развлечений': 'развлечения',
  'развлечениям': 'развлечения',
  'развлечениях': 'развлечения',

  // Образование
  'образованию': 'образование',
  'образования': 'образование',
  'образовании': 'образование',

  // Спорт
  'спорту': 'спорт',
  'спорта': 'спорт',
  'спортом': 'спорт',

  // Красота
  'красоту': 'красота',
  'красоте': 'красота',
  'красоты': 'красота',

  // Путешествия
  'путешествий': 'путешествия',
  'путешествиям': 'путешествия',
  'путешествиях': 'путешествия',

  // Ремонт
  'ремонту': 'ремонт',
  'ремонта': 'ремонт',
  'ремонтом': 'ремонт',

  // Питомец
  'питомцу': 'питомец',
  'питомца': 'питомец',
  'питомцем': 'питомец',

  // Зарплата
  'зарплату': 'зарплата',
  'зарплате': 'зарплата',
  'зарплаты': 'зарплата',

  // Подработка
  'подработку': 'подработка',
  'подработке': 'подработка',
  'подработки': 'подработка',

  // Продажа
  'продажу': 'продажа',
  'продаже': 'продажа',
  'продажи': 'продажа',

  // Возврат
  'возврату': 'возврат',
  'возврата': 'возврат',
  'возвратом': 'возврат',

  // Подарок
  'подарку': 'подарок',
  'подарка': 'подарок',
  'подарком': 'подарок',

  // Проценты
  'процентам': 'проценты',
  'процентов': 'проценты',
  'процентах': 'проценты',

  // Бизнес
  'бизнесу': 'бизнес',
  'бизнеса': 'бизнес',
  'бизнесом': 'бизнес',

  // Подписки (recurring context)
  'подписки': 'подписки',
  'подпискам': 'подписки',
  'подписок': 'подписки',
};

/**
 * Normalizes a category candidate extracted from free-form text.
 * 1. Strips leading Russian prepositions (на, по, за, про, к, в, с, об).
 * 2. Maps declined forms to their nominative canonical form.
 * 3. Falls back to the base normalizeCandidate result if no mapping found.
 *
 * Use this when extracting a category name from a phrase like
 * "сколько потратил на еду" or "бюджет на аренду 30000".
 */
export function normalizeCategoryCandidate(raw: string): string {
  const cleaned = normalizeCandidate(raw)
    .replace(/^(на|по|за|про|к|в|с|со|об|о)\s+/i, '')
    .trim();
  return CATEGORY_FORM_MAP[cleaned] ?? cleaned;
}

/**
 * Resolves a category candidate to a category row.
 *
 * Resolution order:
 *   1. User's own category — exact normalized_name match
 *   2. System category    — exact normalized_name match
 *   3. Alias lookup       — category_aliases.normalized_alias match
 *   4. Repeat 1–3 with declension-normalized form (e.g. "еду" → "еда")
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
  const result = await resolveCategoryByNormalized(db, userId, kind, normalized);
  if (result) return result;

  // Fallback: try with declension-normalized form (еду → еда, аренду → аренда, etc.)
  const normalizedForms = normalizeCandidate(normalizeCategoryCandidate(candidate));
  if (normalizedForms !== normalized) {
    return resolveCategoryByNormalized(db, userId, kind, normalizedForms);
  }

  return null;
}

async function resolveCategoryByNormalized(
  db: DbPool,
  userId: string,
  kind: IntakeKind,
  normalized: string,
): Promise<ResolvedCategory | null> {
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
