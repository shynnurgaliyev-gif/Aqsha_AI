import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramMessage } from '../types';
import { parseIntakeText } from './parser';
import type { IntakeKind } from './parser';
import { parseWithAi } from './ai-parser';
import { resolveCategory } from './category-resolver';
import type { ResolvedCategory } from './category-resolver';
import { getPendingDraft, setPendingDraft, clearPendingDraft } from './session-draft';
import { insertConfirmedTransaction } from './transaction-inserter';
import { getCategoryHint, setCategoryHint } from './category-hints';
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
 * Resolves a category candidate with a cache layer.
 * 1. Check category_hints — return immediately on hit.
 * 2. Fall back to resolveCategory (DB lookup).
 * 3. On success, save to cache for future requests.
 * Cache errors are silently ignored in both directions.
 */
async function resolveWithCache(
  db: DbPool,
  userId: string,
  kind: IntakeKind,
  candidate: string,
): Promise<ResolvedCategory | null> {
  // 1. Cache lookup
  try {
    const cached = await getCategoryHint(db, userId, candidate, kind);
    if (cached) return cached;
  } catch {
    // Cache miss or error — fall through
  }

  // 2. DB resolution
  const resolved = await resolveCategory(db, userId, kind, candidate);
  if (!resolved) return null;

  // 3. Save to cache (fire-and-forget — errors must not affect main flow)
  setCategoryHint(db, userId, candidate, kind, resolved.id, resolved.name).catch(() => undefined);

  return resolved;
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
        savedCategoryId: pendingDraft.categoryId,
        savedKind: pendingDraft.kind,
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
  // Stage 2: AI fallback for broader natural-language input, or category remapping
  //          when deterministic parse succeeded but the extracted category is unknown.
  // If both fail, return a safe unsupported response — no draft is created.
  let parsed = parseIntakeText(text);
  let category = parsed
    ? await resolveWithCache(db, userId, parsed.kind, parsed.categoryCandidate)
    : null;

  // If deterministic parse found a transaction but the category is unknown,
  // let the AI remap it to a canonical category (e.g. "депозит" → "Прочее").
  if (parsed && !category) {
    logger.info({ userId, candidate: parsed.categoryCandidate }, 'Text intake: category not found, retrying with AI');
    parsed = await parseWithAi(text, env.OPENAI_API_KEY, env.OPENAI_MODEL, logger);
    category = parsed
      ? await resolveWithCache(db, userId, parsed.kind, parsed.categoryCandidate)
      : null;
  }

  // If deterministic parse returned nothing, try AI parse from scratch.
  if (!parsed) {
    parsed = await parseWithAi(text, env.OPENAI_API_KEY, env.OPENAI_MODEL, logger);
    if (parsed) {
      logger.info({ userId, kind: parsed.kind, amount: parsed.amount }, 'Text intake: AI parse used');
      category = await resolveWithCache(db, userId, parsed.kind, parsed.categoryCandidate);
    }
  }

  if (!parsed) {
    return {
      kind: 'unsupported',
      message: 'Не понял. Попробуйте: «Расход 2500 Еда» или «Доход 50000 Зарплата».',
    };
  }

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
