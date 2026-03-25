import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { matchAnalyticsQuery } from './query-matcher';
import { parseAnalyticsQueryWithAi } from './ai-query-parser';
import {
  queryBalance,
  queryPeriodTotal,
  queryCategoryBreakdownByPeriod,
  queryRecentTransactions,
} from './analytics-repository';
import {
  formatBalance,
  formatPeriodTotal,
  formatCategoryBreakdownByPeriod,
  formatRecentTransactions,
} from './formatter';

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
    switch (query.type) {
      case 'balance': {
        const balance = await queryBalance(db, userId);
        return formatBalance(balance);
      }

      case 'expense_total': {
        const total = await queryPeriodTotal(db, userId, 'expense', query.period);
        return formatPeriodTotal('expense', total, query.period);
      }

      case 'income_total': {
        const total = await queryPeriodTotal(db, userId, 'income', query.period);
        return formatPeriodTotal('income', total, query.period);
      }

      case 'expense_categories': {
        const rows = await queryCategoryBreakdownByPeriod(db, userId, 'expense', query.period);
        return formatCategoryBreakdownByPeriod('expense', rows, query.period);
      }

      case 'income_categories': {
        const rows = await queryCategoryBreakdownByPeriod(db, userId, 'income', query.period);
        return formatCategoryBreakdownByPeriod('income', rows, query.period);
      }

      case 'recent_transactions': {
        const rows = await queryRecentTransactions(db, userId);
        return formatRecentTransactions(rows);
      }
    }
  } catch (err) {
    logger.error({ err, userId, queryType: query.type }, 'Analytics query error');
    return 'Не удалось получить данные. Попробуйте позже.';
  }
}
