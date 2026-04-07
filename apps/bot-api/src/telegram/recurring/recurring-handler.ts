import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import type { InlineKeyboardMarkup } from '../telegram-client';
import { matchRecurringCreateCommand, matchRecurringListCommand, looksLikeRecurringCommand } from './recurring-command-matcher';
import {
  getPendingRecurringDraft,
  setPendingRecurringDraft,
  clearPendingRecurringDraft,
} from './recurring-session';
import {
  insertRecurringExpense,
  listRecurringExpenses,
  findRecurringExpenseById,
  softDeleteRecurringExpense,
} from './recurring-repository';
import {
  TIME_KEYBOARD,
  formatTimePrompt,
  formatRecurringCreated,
  formatRecurringListWithKeyboard,
} from './recurring-formatter';
import { resolveCategory } from '../text-intake/category-resolver';

export interface RecurringHandlerResponse {
  message: string;
  reply_markup: InlineKeyboardMarkup;
}

/**
 * Handles recurring expense commands:
 *   - List: "регулярные расходы", "мои регулярные", etc.
 *   - Create: "аренда 120000 каждый месяц 5"
 *
 * Returns a response string, a message+keyboard object, or null to fall through.
 */
export async function handleRecurringCommand(
  text: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string | RecurringHandlerResponse | null> {
  // List command
  if (matchRecurringListCommand(text)) {
    const rows = await listRecurringExpenses(db, userId);
    logger.info({ userId, count: rows.length }, 'Recurring expenses listed');
    return formatRecurringListWithKeyboard(rows);
  }

  // Create command
  const draft = matchRecurringCreateCommand(text.toLowerCase().trim());

  if (!draft) {
    // Intercept unrecognised "каждый месяц / ежемесячно" text so it doesn't
    // fall through to the analytics handler and produce a confusing response.
    if (looksLikeRecurringCommand(text)) {
      return 'Не смог разобрать команду. Формат: «Аренда 50000 каждый месяц 5»';
    }
    return null;
  }

  await setPendingRecurringDraft(db, userId, draft);
  logger.info({ userId, description: draft.description, amount: draft.amount, day: draft.dayOfMonth }, 'Pending recurring draft set — awaiting time selection');

  return {
    message: formatTimePrompt(draft.description, draft.amount, draft.dayOfMonth),
    reply_markup: TIME_KEYBOARD,
  };
}

/**
 * Called when the user taps a rec_time:N button.
 * Reads the pending draft, resolves the category, inserts the recurring expense.
 */
export async function handleRecurringTimeCallback(
  hour: number,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string> {
  const draft = await getPendingRecurringDraft(db, userId);
  if (!draft) {
    return '⏱ Время подтверждения истекло. Отправь команду заново.';
  }

  await clearPendingRecurringDraft(db, userId);

  const resolved = await resolveCategory(db, userId, 'expense', draft.description);

  let categoryId: string;
  let categoryName: string;

  if (resolved) {
    categoryId = resolved.id;
    categoryName = resolved.name;
  } else {
    // Fallback to "Другое" category
    const fallback = await resolveCategory(db, userId, 'expense', 'другое');
    if (!fallback) {
      logger.warn({ userId, description: draft.description }, 'No category resolved for recurring expense and no fallback found');
      return `Не удалось определить категорию для «${draft.description}». Уточни название.`;
    }
    categoryId = fallback.id;
    categoryName = fallback.name;
  }

  const rec = await insertRecurringExpense(db, userId, {
    description: draft.description,
    categoryId,
    categoryName,
    amount: draft.amount,
    dayOfMonth: draft.dayOfMonth,
    reminderHour: hour,
  });

  logger.info({ userId, recurringId: rec.id, categoryId, hour }, 'Recurring expense created');
  return formatRecurringCreated(rec);
}

/**
 * Called when the user taps rec_record:UUID from a worker reminder message.
 * Inserts the recurring expense as an actual transaction.
 */
export async function handleRecurringRecordCallback(
  recurringId: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string> {
  const rec = await findRecurringExpenseById(db, recurringId);
  if (!rec) {
    logger.warn({ userId, recurringId }, 'Recurring expense not found for rec_record callback');
    return 'Регулярный расход не найден.';
  }

  await db`
    INSERT INTO transactions
      (user_id, category_id, kind, amount, source_type, source_raw_text, parse_status)
    VALUES
      (${userId}::uuid, ${rec.categoryId}::uuid, 'expense', ${rec.amount},
       'text', ${'Регулярный: ' + rec.description}, 'confirmed')
  `;

  const amountFmt = rec.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  logger.info({ userId, recurringId, amount: rec.amount }, 'Recurring expense recorded as transaction');
  return `✅ Расход записан!\n💵 ${amountFmt} ₸ — ${rec.description}`;
}

/**
 * Called when the user taps 🗑 rec_del:UUID from the recurring list.
 * Soft-deletes the recurring expense.
 */
export async function handleRecurringDeleteCallback(
  recurringId: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string> {
  const deleted = await softDeleteRecurringExpense(db, recurringId, userId);
  if (!deleted) {
    logger.warn({ userId, recurringId }, 'Recurring expense not found or already deleted');
    return 'Регулярный расход не найден или уже удалён.';
  }
  logger.info({ userId, recurringId }, 'Recurring expense deleted');
  return '✅ Регулярный расход удалён.';
}
