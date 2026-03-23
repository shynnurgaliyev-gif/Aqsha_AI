import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import { matchAnalyticsQuery } from './query-matcher';
import {
  queryBalance,
  queryMonthTotal,
  queryCategoryBreakdown,
  queryRecentTransactions,
} from './analytics-repository';
import {
  formatBalance,
  formatMonthTotal,
  formatCategoryBreakdown,
  formatRecentTransactions,
} from './formatter';

/**
 * Attempts to handle a text message as a supported analytics query.
 *
 * Returns a formatted response string if the text matched a known query keyword.
 * Returns null if the text is not a recognized analytics query — caller must
 * fall through to the existing text intake handler.
 *
 * All financial values are computed by deterministic SQL queries.
 * No LLM is involved in any calculation.
 */
export async function handleAnalyticsQuery(
  text: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const queryType = matchAnalyticsQuery(text);

  if (!queryType) {
    return null;
  }

  logger.info({ userId, queryType }, 'Analytics query matched');

  try {
    switch (queryType) {
      case 'balance': {
        const balance = await queryBalance(db, userId);
        return formatBalance(balance);
      }

      case 'expense_month': {
        const total = await queryMonthTotal(db, userId, 'expense');
        return formatMonthTotal('expense', total);
      }

      case 'income_month': {
        const total = await queryMonthTotal(db, userId, 'income');
        return formatMonthTotal('income', total);
      }

      case 'expense_categories': {
        const rows = await queryCategoryBreakdown(db, userId, 'expense');
        return formatCategoryBreakdown('expense', rows);
      }

      case 'income_categories': {
        const rows = await queryCategoryBreakdown(db, userId, 'income');
        return formatCategoryBreakdown('income', rows);
      }

      case 'recent_transactions': {
        const rows = await queryRecentTransactions(db, userId);
        return formatRecentTransactions(rows);
      }
    }
  } catch (err) {
    logger.error({ err, userId, queryType }, 'Analytics query error');
    return 'Не удалось получить данные. Попробуйте позже.';
  }
}
