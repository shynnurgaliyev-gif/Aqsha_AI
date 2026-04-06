/**
 * Recognized commands for resetting all transaction history.
 * Exact-match tokens only — no fuzzy matching.
 */
const RESET_TOKENS = new Set([
  'очистить историю',
  'удалить историю',
  'начать с нуля',
  'сбросить данные',
  'reset',
  'clear history',
]);

export function matchResetCommand(text: string): boolean {
  return RESET_TOKENS.has(text.toLowerCase().trim());
}
