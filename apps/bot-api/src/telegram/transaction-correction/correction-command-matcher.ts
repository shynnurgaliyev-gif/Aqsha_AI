export type CorrectionCommandType = 'show_recent' | 'delete_last';

/**
 * Exact-match tokens for showing recent transactions in correction context.
 *
 * Deliberately excludes tokens already handled by the analytics query-matcher
 * ("последние операции", "последние", "история") to avoid routing ambiguity.
 */
const SHOW_RECENT_TOKENS = new Set([
  'мои последние операции',
  'исправить последнюю запись',
  'исправить последнюю операцию',
  'исправить последнее',
  'исправь последнюю запись',
  'исправь последнюю операцию',
  'исправь последнее',
  'recent transactions',
]);

/**
 * Exact-match tokens for requesting deletion of the last transaction.
 */
const DELETE_LAST_TOKENS = new Set([
  'удалить последнюю',
  'удалить последнюю операцию',
  'удалить последнюю запись',
  'удалить последнее',
  'удали последнюю',
  'удали последнюю операцию',
  'удали последнюю запись',
  'удали последнее',
  'delete last',
  'delete last transaction',
]);

/**
 * Returns the correction command type if the text matches, or null otherwise.
 * Exact-match only — no fuzzy matching.
 */
export function matchCorrectionCommand(text: string): CorrectionCommandType | null {
  const t = text.toLowerCase().trim();
  if (SHOW_RECENT_TOKENS.has(t)) return 'show_recent';
  if (DELETE_LAST_TOKENS.has(t)) return 'delete_last';
  return null;
}
