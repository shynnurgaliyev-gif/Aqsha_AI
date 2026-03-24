import type { CorrectionTransactionRow } from './correction-repository';
import type { PendingDeleteState } from './correction-session';

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
