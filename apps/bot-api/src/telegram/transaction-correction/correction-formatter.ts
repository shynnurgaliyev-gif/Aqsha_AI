import type { CorrectionTransactionRow } from './correction-repository';
import type { PendingDeleteState } from './correction-session';
import type { PendingCorrectionState } from './correction-edit-session';

function formatAmount(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

/**
 * Compact numbered list of recent transactions for correction context.
 * Includes a hint about the delete command.
 */
export function formatRecentForCorrection(rows: CorrectionTransactionRow[]): string {
  if (rows.length === 0) {
    return 'Операций пока нет.';
  }
  const lines = rows.map((r, i) => {
    const sign = r.kind === 'income' ? '+' : '-';
    return `${i + 1}. ${sign}${formatAmount(r.amount)} ${r.categoryName} (${r.transactionDateLocal})`;
  });
  return `Последние операции:\n${lines.join('\n')}\n\nДля удаления последней: «удалить последнюю операцию»`;
}

/**
 * Confirmation prompt shown before a delete is executed.
 */
export function formatDeletePrompt(tx: CorrectionTransactionRow): string {
  const sign = tx.kind === 'income' ? '+' : '-';
  const kindLabel = tx.kind === 'income' ? 'Доход' : 'Расход';
  return (
    `Удалить операцию?\n\n` +
    `${kindLabel}: ${sign}${formatAmount(tx.amount)} — ${tx.categoryName} (${tx.transactionDateLocal})\n\n` +
    `Подтвердить: да / нет`
  );
}

/**
 * Success message shown after a transaction is soft-deleted.
 */
export function formatDeleteSuccess(state: PendingDeleteState): string {
  const sign = state.kind === 'income' ? '+' : '-';
  const kindLabel = state.kind === 'income' ? 'Доход' : 'Расход';
  return `✓ Удалено: ${kindLabel} ${sign}${formatAmount(state.amount)} — ${state.categoryName} (${state.transactionDateLocal}).`;
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
  const sign = tx.kind === 'income' ? '+' : '-';
  return (
    `Исправить сумму?\n\n` +
    `Было:   ${sign}${formatAmount(tx.amount)} — ${tx.categoryName} (${tx.transactionDateLocal})\n` +
    `Станет: ${sign}${formatAmount(newAmount)} — ${tx.categoryName} (${tx.transactionDateLocal})\n\n` +
    `Подтвердить: да / нет`
  );
}

/**
 * Confirmation prompt shown before a category correction is applied.
 */
export function formatCorrectionCategoryPrompt(
  tx: CorrectionTransactionRow,
  newCategoryName: string,
): string {
  const sign = tx.kind === 'income' ? '+' : '-';
  return (
    `Исправить категорию?\n\n` +
    `Было:   ${sign}${formatAmount(tx.amount)} — ${tx.categoryName} (${tx.transactionDateLocal})\n` +
    `Станет: ${sign}${formatAmount(tx.amount)} — ${newCategoryName} (${tx.transactionDateLocal})\n\n` +
    `Подтвердить: да / нет`
  );
}

/**
 * Success message shown after a correction is applied.
 * Renders using the new (post-update) values from the pending state.
 */
export function formatCorrectionSuccess(state: PendingCorrectionState): string {
  const sign = state.kind === 'income' ? '+' : '-';
  const amount = state.field === 'amount' ? (state.newAmount ?? state.currentAmount) : state.currentAmount;
  const category = state.field === 'category' ? (state.newCategoryName ?? state.currentCategoryName) : state.currentCategoryName;
  return `✓ Исправлено: ${sign}${formatAmount(amount)} — ${category} (${state.transactionDateLocal}).`;
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
