import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramMessage } from '../types';
import { parseIntakeText } from './parser';
import { resolveCategory } from './category-resolver';
import { getPendingDraft, setPendingDraft, clearPendingDraft } from './session-draft';
import { insertConfirmedTransaction } from './transaction-inserter';
import type { IntakeResult } from './response';

const CONFIRMATION_TOKENS = new Set(['да', 'yes', 'подтвердить', 'confirm', 'ok', 'ок', '+']);
const CANCELLATION_TOKENS = new Set(['нет', 'no', 'отмена', 'cancel', 'отменить', '-']);

function isConfirmation(text: string): boolean {
  return CONFIRMATION_TOKENS.has(text.toLowerCase().trim());
}

function isCancellation(text: string): boolean {
  return CANCELLATION_TOKENS.has(text.toLowerCase().trim());
}

/**
 * Entry point for text message handling.
 *
 * Flow:
 *   A. If a pending draft exists:
 *      - confirmation token → insert transaction, clear draft
 *      - cancellation token → clear draft
 *      - anything else      → treat as new intake (replace draft)
 *
 *   B. If no pending draft:
 *      - try to parse as "<kind> <amount> <category>"
 *      - resolve category from DB
 *      - store draft in session, return confirmation prompt
 *      - if parse fails or category not found → return safe fallback
 *
 * Does not send Telegram messages directly.
 * Returns an IntakeResult for the caller to act on.
 */
export async function handleTextMessage(
  message: TelegramMessage,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<IntakeResult> {
  const text = message.text?.trim() ?? '';

  if (!text) {
    return { kind: 'unsupported', message: 'Пустое сообщение.' };
  }

  // ── A. Pending draft path ────────────────────────────────────────────────────
  const pendingDraft = await getPendingDraft(db, userId);

  if (pendingDraft) {
    if (isConfirmation(text)) {
      await insertConfirmedTransaction(db, userId, pendingDraft);
      await clearPendingDraft(db, userId);
      logger.info({ userId, amount: pendingDraft.amount, kind: pendingDraft.kind }, 'Transaction confirmed and saved');
      const kindLabel = pendingDraft.kind === 'expense' ? 'Расход' : 'Доход';
      return {
        kind: 'transaction_saved',
        message: `✓ ${kindLabel} ${pendingDraft.amount} — ${pendingDraft.categoryName} сохранён.`,
      };
    }

    if (isCancellation(text)) {
      await clearPendingDraft(db, userId);
      logger.info({ userId }, 'Transaction draft cancelled');
      return { kind: 'cancelled', message: 'Отменено.' };
    }

    // Not a confirmation or cancellation — fall through to treat as new intake.
    // The old draft will be overwritten if the new intake parses successfully.
  }

  // ── B. New intake path ───────────────────────────────────────────────────────
  const parsed = parseIntakeText(text);

  if (!parsed) {
    return {
      kind: 'unsupported',
      message: 'Не понял. Попробуйте: «Расход 2500 Еда» или «Доход 50000 Зарплата».',
    };
  }

  const category = await resolveCategory(db, userId, parsed.kind, parsed.categoryCandidate);

  if (!category) {
    return {
      kind: 'category_not_found',
      message: `Категория «${parsed.categoryCandidate}» не найдена. Проверьте название.`,
      candidate: parsed.categoryCandidate,
    };
  }

  const draft = {
    kind: parsed.kind,
    amount: parsed.amount,
    categoryId: category.id,
    categoryName: category.name,
    rawText: parsed.rawText,
  };

  await setPendingDraft(db, userId, draft);

  logger.info({ userId, kind: parsed.kind, amount: parsed.amount, category: category.name }, 'Transaction draft created');

  const kindLabel = parsed.kind === 'expense' ? 'Расход' : 'Доход';
  return {
    kind: 'confirmation_prompt',
    message: `${kindLabel} ${parsed.amount} — ${category.name}. Подтвердить? (да / нет)`,
    draft,
  };
}
