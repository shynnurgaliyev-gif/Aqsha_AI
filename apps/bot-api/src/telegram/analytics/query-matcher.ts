export type AnalyticsQueryType =
  | 'balance'
  | 'expense_month'
  | 'income_month'
  | 'expense_categories'
  | 'income_categories'
  | 'recent_transactions';

/**
 * Exact-match keyword table for supported analytics queries.
 * Deliberately narrow — do not add fuzzy matching or guessing.
 */
const ANALYTICS_TOKENS = new Map<string, AnalyticsQueryType>([
  ['баланс', 'balance'],
  ['balance', 'balance'],

  ['расходы за месяц', 'expense_month'],
  ['расходы', 'expense_month'],

  ['доходы за месяц', 'income_month'],
  ['доходы', 'income_month'],

  ['категории расходов', 'expense_categories'],
  ['расходы по категориям', 'expense_categories'],

  ['категории доходов', 'income_categories'],
  ['доходы по категориям', 'income_categories'],

  ['последние операции', 'recent_transactions'],
  ['история', 'recent_transactions'],
  ['последние', 'recent_transactions'],
]);

/**
 * Returns the analytics query type if the text exactly matches a supported keyword,
 * or null if the text is not a recognized analytics query.
 */
export function matchAnalyticsQuery(text: string): AnalyticsQueryType | null {
  return ANALYTICS_TOKENS.get(text.toLowerCase().trim()) ?? null;
}
