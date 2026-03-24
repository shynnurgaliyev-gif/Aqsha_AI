import type { BudgetStatusRow } from './budget-repository';

function formatAmount(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

/**
 * Compact success message shown after a budget is created or updated.
 */
export function formatBudgetSet(
  categoryName: string,
  amount: number,
  yearMonth: string,
): string {
  return `✓ Лимит установлен: ${categoryName} — ${formatAmount(amount)} на ${yearMonth}.`;
}

/**
 * Detailed status for a single category budget.
 * Shows over-budget state explicitly.
 */
export function formatBudgetStatus(row: BudgetStatusRow): string {
  const overBudget = row.remaining < 0;
  const remainingLabel = overBudget ? 'Перерасход' : 'Остаток';
  const remainingAbs = Math.abs(row.remaining);
  const prefix = overBudget ? '-' : '';

  return (
    `${row.categoryName} (${row.yearMonth})\n` +
    `Лимит:     ${formatAmount(row.budgetAmount)}\n` +
    `Потрачено: ${formatAmount(row.spent)}\n` +
    `${remainingLabel}: ${prefix}${formatAmount(remainingAbs)}`
  );
}

/**
 * Compact list of all current-month budgets with spent/remaining per category.
 */
export function formatAllBudgetStatuses(rows: BudgetStatusRow[]): string {
  if (rows.length === 0) {
    return 'Лимиты на этот месяц не установлены.';
  }

  const yearMonth = rows[0]!.yearMonth;
  const lines = rows.map((r) => {
    const over = r.remaining < 0;
    const remainingDisplay = over
      ? `-${formatAmount(Math.abs(r.remaining))}`
      : formatAmount(r.remaining);
    return `${r.categoryName}: ${formatAmount(r.spent)} / ${formatAmount(r.budgetAmount)} (${remainingDisplay})`;
  });

  return `Бюджеты на ${yearMonth}:\n${lines.join('\n')}`;
}

/** Shown when the category name could not be resolved to an expense category. */
export const BUDGET_CATEGORY_NOT_FOUND = 'Категория расходов не найдена. Проверьте название.';

/** Shown when no budget is set for the requested category in the current month. */
export const BUDGET_NOT_FOUND = 'Лимит для этой категории на текущий месяц не установлен.';
