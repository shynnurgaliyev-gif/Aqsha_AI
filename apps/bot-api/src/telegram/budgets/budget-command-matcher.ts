/**
 * Budget command matcher.
 *
 * Three command types:
 *   set_budget  — create or update a monthly category budget
 *   show_budget — show spending vs budget for a specific category
 *   list_budgets — list all budgets for the current month
 *
 * All matching is exact-token or regex-based.
 * No fuzzy matching.
 */

export interface SetBudgetCommand {
  type: 'set_budget';
  categoryCandidate: string;
  amount: number;
}

export interface ShowBudgetCommand {
  type: 'show_budget';
  categoryCandidate: string;
}

export interface ListBudgetsCommand {
  type: 'list_budgets';
}

export interface DeleteBudgetCommand {
  type: 'delete_budget';
  categoryCandidate: string;
}

export type BudgetCommand = SetBudgetCommand | ShowBudgetCommand | ListBudgetsCommand | DeleteBudgetCommand;

/**
 * Exact tokens for listing all current-month budgets.
 */
const LIST_TOKENS = new Set([
  'мои лимиты',
  'лимиты',
  'бюджеты',
  'мои бюджеты',
  'показать бюджеты',
  'покажи бюджеты',
  'my budgets',
  'budgets',
]);

/**
 * Regex patterns for setting a budget.
 * Format: <prefix> <category> <amount>
 * The trailing \s+(\d+)$ anchor ensures the number is last.
 *
 * Examples:
 *   "лимит еда 50000"
 *   "бюджет кофе 10000"
 *   "set budget food 50000"
 */
const SET_PATTERNS: RegExp[] = [
  /^лимит\s+на\s+(.+)\s+(\d+)$/,
  /^лимит\s+(.+)\s+(\d+)$/,
  /^бюджет\s+на\s+(.+)\s+(\d+)$/,
  /^бюджет\s+(.+)\s+(\d+)$/,
  /^установи\s+(?:бюджет|лимит)\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^установить\s+(?:бюджет|лимит)\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^поставить\s+(?:бюджет|лимит)\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^поставь\s+(?:бюджет|лимит)\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^добавить\s+бюджет\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^добавь\s+бюджет\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^set\s+budget\s+(.+)\s+(\d+)$/,
];

/**
 * Regex patterns for deleting a budget.
 * Checked before show patterns to avoid "удали лимит еда" matching show.
 */
const DELETE_PATTERNS: RegExp[] = [
  /^удали\s+(?:бюджет|лимит)\s+(.+)$/,
  /^удалить\s+(?:бюджет|лимит)\s+(.+)$/,
  /^убери\s+(?:бюджет|лимит)\s+(.+)$/,
  /^убрать\s+(?:бюджет|лимит)\s+(.+)$/,
  /^delete\s+budget\s+(.+)$/,
];

/**
 * Regex patterns for showing budget status for a specific category.
 * Checked only when set pattern does not match (no trailing number).
 *
 * Examples:
 *   "лимит еда"
 *   "бюджет кофе"
 *   "budget food"
 */
const SHOW_PATTERNS: RegExp[] = [
  /^лимит\s+(?:на\s+)?(.+)$/,
  /^бюджет\s+(?:на\s+)?(.+)$/,
  /^budget\s+(.+)$/,
];

/**
 * Returns a typed budget command if the text matches, or null otherwise.
 *
 * Priority:
 *   1. LIST_TOKENS (exact)
 *   2. SET_PATTERNS (regex, ends with a positive integer)
 *   3. SHOW_PATTERNS (regex, no trailing number)
 */
export function matchBudgetCommand(text: string): BudgetCommand | null {
  const t = text.toLowerCase().trim().replace(/[.!?,;]+$/, '');

  if (LIST_TOKENS.has(t)) {
    return { type: 'list_budgets' };
  }

  for (const pattern of SET_PATTERNS) {
    const m = t.match(pattern);
    if (m && m[1] && m[2]) {
      const amount = parseInt(m[2], 10);
      if (amount > 0) {
        return { type: 'set_budget', categoryCandidate: m[1].trim(), amount };
      }
    }
  }

  for (const pattern of DELETE_PATTERNS) {
    const m = t.match(pattern);
    if (m && m[1]) {
      return { type: 'delete_budget', categoryCandidate: m[1].trim() };
    }
  }

  for (const pattern of SHOW_PATTERNS) {
    const m = t.match(pattern);
    if (m && m[1]) {
      return { type: 'show_budget', categoryCandidate: m[1].trim() };
    }
  }

  return null;
}
