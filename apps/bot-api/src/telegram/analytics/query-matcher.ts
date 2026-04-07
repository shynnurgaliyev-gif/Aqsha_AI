/**
 * Supported analytics query types.
 * 'balance' and 'recent_transactions' are period-agnostic.
 * All others are dispatched with an explicit AnalyticsPeriod.
 */
export type AnalyticsQueryType =
  | 'balance'
  | 'expense_total'
  | 'income_total'
  | 'expense_categories'
  | 'income_categories'
  | 'recent_transactions'
  | 'category_scoped';

/**
 * Supported deterministic analytics periods.
 *
 * All date boundaries are computed against transaction_date_local,
 * which stores the user's local date at transaction recording time.
 * Period lower/upper bounds use the server's current_date as the reference
 * point — consistent with the existing analytics layer. Per-user timezone
 * support would require storing a timezone preference in the DB.
 *
 * current_week semantics: ISO week, Monday–Sunday.
 * PostgreSQL's date_trunc('week', ...) uses Monday as week start (ISO 8601).
 */
export type AnalyticsPeriod =
  | 'current_month'
  | 'today'
  | 'yesterday'
  | 'current_week'
  | 'previous_month';

export interface AnalyticsQuery {
  type: AnalyticsQueryType;
  /** Period to scope the query. Ignored for 'balance' and 'recent_transactions'. */
  period: AnalyticsPeriod;
  /** Raw category name — only set for 'category_scoped' queries. */
  category?: string;
  /** Transaction kind — only set for 'category_scoped' queries. */
  kind?: 'expense' | 'income';
}

/**
 * Exact-match keyword table for supported analytics queries.
 * Deliberately narrow — do not add fuzzy matching or guessing here.
 * Broader natural-language queries are handled by the AI fallback layer.
 */
const ANALYTICS_TOKENS = new Map<string, AnalyticsQuery>([
  // ── Balance ───────────────────────────────────────────────────────────────
  ['баланс', { type: 'balance', period: 'current_month' }],
  ['balance', { type: 'balance', period: 'current_month' }],

  // ── Expense totals ────────────────────────────────────────────────────────
  ['расходы за месяц', { type: 'expense_categories', period: 'current_month' }],
  ['расходы за этот месяц', { type: 'expense_categories', period: 'current_month' }],
  ['расходы этого месяца', { type: 'expense_categories', period: 'current_month' }],
  ['расходы', { type: 'expense_categories', period: 'current_month' }],
  ['мои расходы', { type: 'expense_categories', period: 'current_month' }],
  ['траты', { type: 'expense_categories', period: 'current_month' }],
  ['траты за месяц', { type: 'expense_categories', period: 'current_month' }],
  ['мои траты', { type: 'expense_categories', period: 'current_month' }],
  ['что по расходам', { type: 'expense_categories', period: 'current_month' }],
  ['покажи расходы', { type: 'expense_categories', period: 'current_month' }],
  ['сколько потратил', { type: 'expense_total', period: 'current_month' }],
  ['сколько потратила', { type: 'expense_total', period: 'current_month' }],
  ['сколько ушло', { type: 'expense_total', period: 'current_month' }],
  ['расходы сегодня', { type: 'expense_total', period: 'today' }],
  ['расходы за сегодня', { type: 'expense_total', period: 'today' }],
  ['сегодняшние расходы', { type: 'expense_total', period: 'today' }],
  ['траты за сегодня', { type: 'expense_total', period: 'today' }],
  ['сколько потратил сегодня', { type: 'expense_total', period: 'today' }],
  ['расходы вчера', { type: 'expense_total', period: 'yesterday' }],
  ['расходы за вчера', { type: 'expense_total', period: 'yesterday' }],
  ['вчерашние расходы', { type: 'expense_total', period: 'yesterday' }],
  ['траты вчера', { type: 'expense_total', period: 'yesterday' }],
  ['сколько потратил вчера', { type: 'expense_total', period: 'yesterday' }],
  ['расходы за неделю', { type: 'expense_total', period: 'current_week' }],
  ['расходы за эту неделю', { type: 'expense_total', period: 'current_week' }],
  ['расходы этой недели', { type: 'expense_total', period: 'current_week' }],
  ['траты за неделю', { type: 'expense_total', period: 'current_week' }],
  ['расходы за 7 дней', { type: 'expense_total', period: 'current_week' }],
  ['расходы за последние 7 дней', { type: 'expense_total', period: 'current_week' }],
  ['расходы за 30 дней', { type: 'expense_categories', period: 'current_month' }],
  ['расходы за последние 30 дней', { type: 'expense_categories', period: 'current_month' }],
  ['расходы за прошлый месяц', { type: 'expense_total', period: 'previous_month' }],
  ['расходы прошлого месяца', { type: 'expense_total', period: 'previous_month' }],

  // ── Income totals ─────────────────────────────────────────────────────────
  ['доходы за месяц', { type: 'income_categories', period: 'current_month' }],
  ['доходы за этот месяц', { type: 'income_categories', period: 'current_month' }],
  ['доходы этого месяца', { type: 'income_categories', period: 'current_month' }],
  ['доходы', { type: 'income_categories', period: 'current_month' }],
  ['мои доходы', { type: 'income_categories', period: 'current_month' }],
  ['сколько заработал', { type: 'income_total', period: 'current_month' }],
  ['сколько заработала', { type: 'income_total', period: 'current_month' }],
  ['сколько пришло', { type: 'income_total', period: 'current_month' }],
  ['доходы сегодня', { type: 'income_total', period: 'today' }],
  ['доходы за сегодня', { type: 'income_total', period: 'today' }],
  ['доходы вчера', { type: 'income_total', period: 'yesterday' }],
  ['доходы за вчера', { type: 'income_total', period: 'yesterday' }],
  ['доходы за неделю', { type: 'income_total', period: 'current_week' }],
  ['доходы за эту неделю', { type: 'income_total', period: 'current_week' }],
  ['доходы за прошлый месяц', { type: 'income_total', period: 'previous_month' }],
  ['доходы прошлого месяца', { type: 'income_total', period: 'previous_month' }],

  // ── Category breakdown ────────────────────────────────────────────────────
  ['категории расходов', { type: 'expense_categories', period: 'current_month' }],
  ['расходы по категориям', { type: 'expense_categories', period: 'current_month' }],
  ['расходы по категориям за неделю', { type: 'expense_categories', period: 'current_week' }],
  ['расходы по категориям за эту неделю', { type: 'expense_categories', period: 'current_week' }],
  ['расходы по категориям за прошлый месяц', { type: 'expense_categories', period: 'previous_month' }],
  ['расходы прошлого месяца по категориям', { type: 'expense_categories', period: 'previous_month' }],
  ['категории доходов', { type: 'income_categories', period: 'current_month' }],
  ['доходы по категориям', { type: 'income_categories', period: 'current_month' }],
  ['доходы по категориям за прошлый месяц', { type: 'income_categories', period: 'previous_month' }],

  // ── Recent transactions ───────────────────────────────────────────────────
  ['последние операции', { type: 'recent_transactions', period: 'current_month' }],
  ['история', { type: 'recent_transactions', period: 'current_month' }],
  ['последние', { type: 'recent_transactions', period: 'current_month' }],
]);

/**
 * Regex patterns for category-scoped queries.
 * Matches "сколько потратил на еду", "сколько ушло на такси", etc.
 */
const CATEGORY_SCOPED_PATTERNS: Array<[RegExp, 'expense' | 'income', AnalyticsPeriod]> = [
  [/^сколько (?:потратил|потратила|ушло|трачу)\s+на\s+(.+)$/, 'expense', 'current_month'],
  [/^расходы на\s+(.+)$/, 'expense', 'current_month'],
  [/^траты на\s+(.+)$/, 'expense', 'current_month'],
  [/^сколько (?:пришло|заработал|заработала)\s+(?:на|от|по|за)\s+(.+)$/, 'income', 'current_month'],
];

/**
 * Returns the analytics query if the text matches a supported keyword or pattern,
 * or null if the text is not a recognized analytics query.
 * Strips trailing punctuation for voice compatibility.
 */
export function matchAnalyticsQuery(text: string): AnalyticsQuery | null {
  const t = text.toLowerCase().trim().replace(/[.!?,;]+$/, '');

  const exact = ANALYTICS_TOKENS.get(t);
  if (exact) return exact;

  for (const [pattern, kind, period] of CATEGORY_SCOPED_PATTERNS) {
    const m = t.match(pattern);
    if (m?.[1]) {
      return { type: 'category_scoped', period, category: m[1].trim(), kind };
    }
  }

  return null;
}
