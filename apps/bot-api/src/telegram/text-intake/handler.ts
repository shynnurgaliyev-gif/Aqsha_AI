import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramMessage } from '../types';
import { parseIntakeText } from './parser';
import { parseWithAi } from './ai-parser';
import { resolveCategory } from './category-resolver';
import { getPendingDraft, setPendingDraft, clearPendingDraft } from './session-draft';
import { insertConfirmedTransaction } from './transaction-inserter';
import type { IntakeResult } from './response';

/** Formats a number with space as thousands separator: 14500 → "14 500" */
function fmt(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

export const CONFIRMATION_KEYBOARD = {
  inline_keyboard: [[
    { text: '✅ Да', callback_data: 'confirm' },
    { text: '❌ Отмена', callback_data: 'cancel' },
  ]],
};

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
  env: AppEnv,
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
      const savedEmoji = pendingDraft.kind === 'expense' ? '📤' : '📥';
      const savedLabel = pendingDraft.kind === 'expense' ? 'Расход записан' : 'Доход записан';
      return {
        kind: 'transaction_saved',
        message: `${savedEmoji} ${savedLabel}!\n💵 Сумма: ${fmt(pendingDraft.amount)} ₸\n📁 Категория: ${pendingDraft.categoryName}`,
      };
    }

    if (isCancellation(text)) {
      await clearPendingDraft(db, userId);
      logger.info({ userId }, 'Transaction draft cancelled');
      return { kind: 'cancelled', message: '❌ Отменено.' };
    }

    // Not a confirmation or cancellation — fall through to treat as new intake.
    // The old draft will be overwritten if the new intake parses successfully.
  }

  // ── B. New intake path ───────────────────────────────────────────────────────
  // Stage 1: cheap deterministic parser.
  // Stage 2: AI fallback for broader natural-language input.
  // If both fail, return a safe unsupported response — no draft is created.
  let parsed = parseIntakeText(text);

  if (!parsed) {
    parsed = await parseWithAi(text, env.OPENAI_API_KEY, env.OPENAI_MODEL, logger);
    if (parsed) {
      logger.info({ userId, kind: parsed.kind, amount: parsed.amount }, 'Text intake: AI parse used');
    }
  }

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

  const confirmEmoji = parsed.kind === 'expense' ? '📤' : '📥';
  const confirmLabel = parsed.kind === 'expense' ? 'Расход' : 'Доход';
  return {
    kind: 'confirmation_prompt',
    message: `${confirmEmoji} Подтверждаешь?\n💵 Сумма: ${fmt(parsed.amount)} ₸\n📁 Категория: ${category.name}\n🔖 Тип: ${confirmLabel}`,
    draft,
  };
}
