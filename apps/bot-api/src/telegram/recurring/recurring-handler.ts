import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { InlineKeyboardMarkup } from '../telegram-client';
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
  formatRecurringDayPrompt,
  RECURRING_DAY_KEYBOARD,
  RECURRING_NOT_FOUND,
} from './recurring-formatter';
import { getPendingRecurringDraft, setPendingRecurringDraft, clearPendingRecurringDraft } from './recurring-session-draft';
import { parseWithAi } from '../text-intake/ai-parser';
import { resolveCategory } from '../text-intake/category-resolver';

export interface RecurringHandlerResponse {
  text: string;
  reply_markup?: InlineKeyboardMarkup;
}

/**
 * Handles recurring expense commands.
 * Returns a RecurringHandlerResponse if the text matched, or null to pass through.
 *
 * Supported commands:
 *   create — "аренда 150000 каждый месяц" → prompts for day of month via inline keyboard
 *   list   — "мои подписки" / "регулярные расходы"
 *   delete — "удали регулярный аренда"
 */
export async function handleRecurringCommand(
  text: string,
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<RecurringHandlerResponse | null> {
  const command = matchRecurringCommand(text);
  if (!command) return null;

  if (command.type === 'list') {
    const items = await listRecurringExpenses(db, userId);
    logger.info({ userId, count: items.length }, 'Recurring expense list requested');
    return { text: formatRecurringList(items) };
  }

  if (command.type === 'delete') {
    const item = await findRecurringExpenseByName(db, userId, command.nameQuery);
    if (!item) {
      logger.info({ userId, nameQuery: command.nameQuery }, 'Recurring expense not found for delete');
      return { text: RECURRING_NOT_FOUND };
    }
    await deleteRecurringExpense(db, userId, item.id);
    logger.info({ userId, id: item.id, description: item.description }, 'Recurring expense deleted');
    return { text: formatRecurringDeleted(item.description) };
  }

  if (command.type === 'create') {
    // Store the draft in session and ask the user to pick a day.
    await setPendingRecurringDraft(db, userId, {
      description: command.description,
      amount: command.amount,
    });
    logger.info({ userId, description: command.description, amount: command.amount }, 'Recurring draft stored — awaiting day selection');
    return {
      text: formatRecurringDayPrompt(command.description, command.amount),
      reply_markup: RECURRING_DAY_KEYBOARD,
    };
  }

  return null;
}

/**
 * Called when the user taps a day button (callback_data: "rec_day:N").
 * Reads the pending draft, creates the recurring expense, clears the draft.
 * Returns null if there is no pending draft (e.g. stale callback).
 */
export async function handleRecurringDayCallback(
  day: number,
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const draft = await getPendingRecurringDraft(db, userId);
  if (!draft) {
    logger.info({ userId, day }, 'rec_day callback but no pending recurring draft — ignoring');
    return '⏱ Сессия истекла. Отправь команду заново.';
  }

  await clearPendingRecurringDraft(db, userId);

  const category = await resolveRecurringCategory(draft.description, draft.amount, userId, db, env, logger);

  const clampedDay = Math.max(1, Math.min(28, day));
  const item = await createRecurringExpense(db, userId, draft.description, category.id, category.name, draft.amount, clampedDay);

  logger.info({ userId, id: item.id, description: item.description, amount: item.amount, dayOfMonth: item.dayOfMonth }, 'Recurring expense created via day callback');
  return formatRecurringCreated(item);
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
