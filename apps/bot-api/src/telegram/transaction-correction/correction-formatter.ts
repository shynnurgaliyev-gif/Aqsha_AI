import type { CorrectionTransactionRow } from './correction-repository';
import type { PendingDeleteState } from './correction-session';
import type { PendingCorrectionState } from './correction-edit-session';
import type { PendingBulkDeleteState } from './correction-bulk-delete-session';

function formatAmount(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + ' ₸';
}

/** DD.MM.YYYY from YYYY-MM-DD */
function fmtDate(d: string): string {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}

/**
 * Compact numbered list of recent transactions for correction context.
 * Includes hints for all correction actions (amount, category, delete).
 */
export function formatRecentForCorrection(rows: CorrectionTransactionRow[]): string {
  if (rows.length === 0) {
    return 'Операций пока нет.';
  }
  const lines = rows.map((r, i) => {
    const emoji = r.kind === 'income' ? '📥' : '📤';
    return `${i + 1}. ${emoji} ${r.categoryName} — ${formatAmount(r.amount)} (${fmtDate(r.transactionDateLocal)})`;
  });
  return (
    `📋 Последние операции:\n\n${lines.join('\n')}\n\n` +
    `Исправить сумму: «исправь сумму на 500»\n` +
    `Сменить категорию: «исправь категорию на Транспорт»\n` +
    `Удалить последнюю: «удалить последнюю операцию»`
  );
}

/**
 * Confirmation prompt shown before a delete is executed.
 */
export function formatDeletePrompt(tx: CorrectionTransactionRow): string {
  const emoji = tx.kind === 'income' ? '📥' : '📤';
  const kindLabel = tx.kind === 'income' ? 'Доход' : 'Расход';
  return (
    `🗑 Удалить операцию?\n\n` +
    `${emoji} ${kindLabel}: ${formatAmount(tx.amount)} — ${tx.categoryName} (${fmtDate(tx.transactionDateLocal)})\n\n` +
    `Подтверди: да / нет`
  );
}

/**
 * Success message shown after a transaction is soft-deleted.
 */
export function formatDeleteSuccess(state: PendingDeleteState): string {
  const emoji = state.kind === 'income' ? '📥' : '📤';
  const kindLabel = state.kind === 'income' ? 'Доход' : 'Расход';
  return `✅ Удалено: ${emoji} ${kindLabel} ${formatAmount(state.amount)} — ${state.categoryName} (${fmtDate(state.transactionDateLocal)})`;
}

/** Shown when the user cancels a pending delete. */
export const DELETE_CANCELLED = 'Удаление отменено.';

/** Shown when user sends non-да/нет text while a delete is pending. */
export const DELETE_AWAITING = 'Ожидаю подтверждения удаления. Ответьте: да или нет.';

/** Shown when no deletable transaction was found. */
export const DELETE_NOT_FOUND = 'Нет операций для удаления.';

/** Shown when the soft-delete UPDATE affected no rows (already deleted or gone). */
export const DELETE_FAILED = 'Операция не найдена или уже удалена. Попробуйте снова.';

// ─────────────────────────────────────────────────────────────────────────────
// Correction (amount / category) formatters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confirmation prompt shown before an amount correction is applied.
 */
export function formatCorrectionAmountPrompt(
  tx: CorrectionTransactionRow,
  newAmount: number,
): string {
  const emoji = tx.kind === 'income' ? '📥' : '📤';
  return (
    `✏️ Исправить сумму?\n\n` +
    `Было:   ${emoji} ${formatAmount(tx.amount)} — ${tx.categoryName} (${fmtDate(tx.transactionDateLocal)})\n` +
    `Станет: ${emoji} ${formatAmount(newAmount)} — ${tx.categoryName} (${fmtDate(tx.transactionDateLocal)})\n\n` +
    `Подтверди: да / нет`
  );
}

/**
 * Confirmation prompt shown before a category correction is applied.
 */
export function formatCorrectionCategoryPrompt(
  tx: CorrectionTransactionRow,
  newCategoryName: string,
): string {
  const emoji = tx.kind === 'income' ? '📥' : '📤';
  return (
    `✏️ Сменить категорию?\n\n` +
    `Было:   ${emoji} ${formatAmount(tx.amount)} — ${tx.categoryName} (${fmtDate(tx.transactionDateLocal)})\n` +
    `Станет: ${emoji} ${formatAmount(tx.amount)} — ${newCategoryName} (${fmtDate(tx.transactionDateLocal)})\n\n` +
    `Подтверди: да / нет`
  );
}

/**
 * Success message shown after a correction is applied.
 * Renders using the new (post-update) values from the pending state.
 */
export function formatCorrectionSuccess(state: PendingCorrectionState): string {
  const emoji = state.kind === 'income' ? '📥' : '📤';
  const amount = state.field === 'amount' ? (state.newAmount ?? state.currentAmount) : state.currentAmount;
  const category = state.field === 'category' ? (state.newCategoryName ?? state.currentCategoryName) : state.currentCategoryName;
  return `✅ Исправлено: ${emoji} ${formatAmount(amount)} — ${category} (${fmtDate(state.transactionDateLocal)})`;
}

/** Shown when user sends non-да/нет text while a correction is pending. */
export const CORRECTION_AWAITING = 'Ожидаю подтверждения исправления. Ответьте: да или нет.';

/** Shown when the user cancels a pending correction. */
export const CORRECTION_CANCELLED = 'Исправление отменено.';

/** Shown when no correctable transaction was found. */
export const CORRECTION_NO_TRANSACTION = 'Нет операций для исправления.';

/** Shown when the correction UPDATE affected no rows (concurrent change or already modified). */
export const CORRECTION_FAILED = 'Операция не найдена или уже изменена. Попробуйте снова.';

/** Shown when the category name could not be resolved. */
export const CORRECTION_CATEGORY_NOT_FOUND = 'Категория не найдена. Проверьте название.';

// ─────────────────────────────────────────────────────────────────────────────
// Bulk delete formatters
// ─────────────────────────────────────────────────────────────────────────────

function kindSuffix(kind?: 'expense' | 'income'): string {
  if (kind === 'expense') return ' (расходы)';
  if (kind === 'income')  return ' (доходы)';
  return '';
}

/**
 * Confirmation prompt before bulk deletion is executed.
 */
export function formatBulkDeletePrompt(state: PendingBulkDeleteState): string {
  return (
    `🗑 Удалить ${state.count} операций${kindSuffix(state.kind)} ${state.periodLabel} ` +
    `на сумму ${formatAmount(state.totalAmount)}?`
  );
}

/**
 * Success message after bulk deletion is executed.
 * count is the number of rows actually deleted (may differ from preview
 * due to concurrent changes).
 */
export function formatBulkDeleteSuccess(state: PendingBulkDeleteState, deletedCount: number): string {
  return `✓ Удалено ${deletedCount} операций${kindSuffix(state.kind)} ${state.periodLabel}.`;
}

/** Shown when no matching transactions were found for the requested period. */
export const BULK_DELETE_NOTHING_FOUND = 'Операций за этот период не найдено.';

/** Shown when the user sends non-да/нет text while a bulk delete is pending. */
export const BULK_DELETE_AWAITING = 'Ожидаю подтверждения удаления. Ответьте: да или нет.';

/** Shown when the user cancels a pending bulk delete. */
export const BULK_DELETE_CANCELLED = 'Удаление отменено.';
