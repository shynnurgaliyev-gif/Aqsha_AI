import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { matchAnalyticsQuery } from './query-matcher';
import { parseAnalyticsQueryWithAi } from './ai-query-parser';
import { resolvePeriodRange, getLocalDate } from './period-resolver';
import {
  getUserTimezone,
  queryBalance,
  queryPeriodTotal,
  queryCategoryBreakdownByPeriod,
  queryCategoryScopedTotal,
  queryRecentTransactions,
} from './analytics-repository';
import {
  formatBalance,
  formatPeriodTotal,
  formatCategoryBreakdownByPeriod,
  formatCategoryScopedTotal,
  formatRecentTransactions,
} from './formatter';
import { resolveCategory, normalizeCategoryCandidate } from '../text-intake/category-resolver';
import type { DateRange } from './period-resolver';

/**
 * Caps the display range's upper bound to tomorrow (exclusive) in the user's
 * local timezone, so the displayed end date shows today rather than the last
 * day of the month when the month is still in progress.
 */
function capRangeToToday(range: DateRange, timezone: string): DateRange {
  const today = getLocalDate(timezone);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);
  return { gte: range.gte, lt: range.lt > tomorrow ? tomorrow : range.lt };
}

/**
 * Attempts to handle a text message as a supported analytics query.
 *
 * Flow:
 *   Stage 1: cheap deterministic keyword matcher (no API cost).
 *   Stage 2: AI fallback for broader natural-language queries (OpenAI API).
 *   If both stages return null, caller falls through to text intake handler.
 *
 * Returns a formatted response string if a query matched.
 * Returns null if the text is not a recognised analytics query.
 *
 * All financial values are computed by deterministic SQL queries.
 * The LLM is used only to extract intent — never to calculate values.
 *
 * Period boundaries are derived from the user's stored timezone, not from
 * the server's current_date. This ensures "today" and "this week" match the
 * user's local calendar day regardless of the server's timezone.
 */
export async function handleAnalyticsQuery(
  text: string,
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  // ── Stage 1: deterministic keyword match ─────────────────────────────────────
  let query = matchAnalyticsQuery(text);

  if (query) {
    logger.info({ userId, queryType: query.type, period: query.period }, 'Analytics query matched (deterministic)');
  }

  // ── Stage 2: AI fallback ─────────────────────────────────────────────────────
  if (!query) {
    query = await parseAnalyticsQueryWithAi(text, env.OPENAI_API_KEY, env.OPENAI_MODEL, logger);
    if (query) {
      logger.info({ userId, queryType: query.type, period: query.period }, 'Analytics query matched via AI');
    }
  }

  if (!query) {
    return null;
  }

  try {
    // ── Timezone-aware date range resolution ───────────────────────────────────
    // Resolve the date range from the user's stored timezone before executing any
    // query. balance and recent_transactions are period-agnostic and do not use
    // the range, but fetching the timezone here keeps the flow uniform.
    const timezone = await getUserTimezone(db, userId);
    const range = resolvePeriodRange(query.period, timezone);

    logger.debug({ userId, timezone, range, period: query.period }, 'Analytics period resolved');
    switch (query.type) {
      case 'balance': {
        const balance = await queryBalance(db, userId);
        return formatBalance(balance);
      }

      case 'expense_total': {
        const total = await queryPeriodTotal(db, userId, 'expense', range);
        return formatPeriodTotal('expense', total, query.period);
      }

      case 'income_total': {
        const total = await queryPeriodTotal(db, userId, 'income', range);
        return formatPeriodTotal('income', total, query.period);
      }

      case 'expense_categories': {
        const rows = await queryCategoryBreakdownByPeriod(db, userId, 'expense', range);
        const displayRange = capRangeToToday(range, timezone);
        return formatCategoryBreakdownByPeriod('expense', rows, displayRange);
      }

      case 'income_categories': {
        const rows = await queryCategoryBreakdownByPeriod(db, userId, 'income', range);
        const displayRange = capRangeToToday(range, timezone);
        return formatCategoryBreakdownByPeriod('income', rows, displayRange);
      }

      case 'recent_transactions': {
        const rows = await queryRecentTransactions(db, userId);
        return formatRecentTransactions(rows);
      }

      case 'category_scoped': {
        const rawCategory = query.category ?? '';
        const categoryName = normalizeCategoryCandidate(rawCategory);
        const kind = query.kind ?? 'expense';
        const resolved = await resolveCategory(db, userId, kind, categoryName);
        if (!resolved) {
          return `Категория "${categoryName}" не найдена. Проверьте название и попробуйте снова.`;
        }
        const result = await queryCategoryScopedTotal(db, userId, kind, resolved.id, range);
        const displayRange = capRangeToToday(range, timezone);
        if (!result || result.total === 0) {
          return `По категории "${resolved.name}" нет данных за этот период.`;
        }
        return formatCategoryScopedTotal(result, kind, displayRange);
      }
    }
  } catch (err) {
    logger.error({ err, userId, queryType: query.type }, 'Analytics query error');
    return 'Не удалось получить данные. Попробуйте позже.';
  }
}
