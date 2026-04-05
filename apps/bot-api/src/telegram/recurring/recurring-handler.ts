import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { matchRecurringCommand } from './recurring-command-matcher';
import {
  createRecurringExpense,
  listRecurringExpenses,
  findRecurringExpenseByName,
  deleteRecurringExpense,
} from './recurring-repository';
import {
  formatRecurringCreated,
  formatRecurringList,
  formatRecurringDeleted,
  RECURRING_NOT_FOUND,
} from './recurring-formatter';
import { parseWithAi } from '../text-intake/ai-parser';
import { resolveCategory } from '../text-intake/category-resolver';

/**
 * Handles recurring expense commands.
 * Returns a response string if the text matched, or null to pass through.
 *
 * Supported commands:
 *   create — "аренда 150000 каждый месяц" / "аренда 150000 ежемесячно"
 *   list   — "мои подписки" / "регулярные расходы"
 *   delete — "удали регулярный аренда"
 */
export async function handleRecurringCommand(
  text: string,
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const command = matchRecurringCommand(text);
  if (!command) return null;

  if (command.type === 'list') {
    const items = await listRecurringExpenses(db, userId);
    logger.info({ userId, count: items.length }, 'Recurring expense list requested');
    return formatRecurringList(items);
  }

  if (command.type === 'delete') {
    const item = await findRecurringExpenseByName(db, userId, command.nameQuery);
    if (!item) {
      logger.info({ userId, nameQuery: command.nameQuery }, 'Recurring expense not found for delete');
      return RECURRING_NOT_FOUND;
    }
    await deleteRecurringExpense(db, userId, item.id);
    logger.info({ userId, id: item.id, description: item.description }, 'Recurring expense deleted');
    return formatRecurringDeleted(item.description);
  }

  if (command.type === 'create') {
    // Resolve category via AI parser using the description + amount as context text.
    const categoryName = await resolveRecurringCategory(
      command.description,
      command.amount,
      userId,
      db,
      env,
      logger,
    );

    const item = await createRecurringExpense(
      db,
      userId,
      command.description,
      categoryName.id,
      categoryName.name,
      command.amount,
      command.dayOfMonth,
    );

    logger.info(
      { userId, id: item.id, description: item.description, amount: item.amount },
      'Recurring expense created',
    );
    return formatRecurringCreated(item);
  }

  return null;
}

/**
 * Resolves the category for a recurring expense description.
 * Calls the AI parser with the description + amount, then looks up the category in the DB.
 * Falls back to the system "Прочее" (expense) category if AI fails or category not found.
 */
async function resolveRecurringCategory(
  description: string,
  amount: number,
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<{ id: string; name: string }> {
  const parsed = await parseWithAi(
    `${description} ${amount}`,
    env.OPENAI_API_KEY,
    env.OPENAI_MODEL,
    logger,
  );

  if (parsed) {
    const resolved = await resolveCategory(db, userId, 'expense', parsed.categoryCandidate);
    if (resolved) return { id: resolved.id, name: resolved.name };
  }

  // Fallback: find system "Прочее" expense category
  const fallback = await resolveCategory(db, userId, 'expense', 'прочее');
  if (fallback) return { id: fallback.id, name: fallback.name };

  throw new Error('Cannot resolve category — no fallback "Прочее" system category found');
}
