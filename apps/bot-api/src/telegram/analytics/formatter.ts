import type { CategoryTotalRow, RecentTransactionRow } from './analytics-repository';

function formatAmount(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

export function formatBalance(balance: number): string {
  const sign = balance >= 0 ? '+' : '';
  return `Баланс: ${sign}${formatAmount(balance)}`;
}

export function formatMonthTotal(kind: 'expense' | 'income', total: number): string {
  const label = kind === 'expense' ? 'Расходы за месяц' : 'Доходы за месяц';
  return `${label}: ${formatAmount(total)}`;
}

export function formatCategoryBreakdown(kind: 'expense' | 'income', rows: CategoryTotalRow[]): string {
  const label = kind === 'expense' ? 'Расходы по категориям (этот месяц)' : 'Доходы по категориям (этот месяц)';
  if (rows.length === 0) {
    return `${label}:\nНет данных.`;
  }
  const lines = rows.map((r, i) => `${i + 1}. ${r.categoryName} — ${formatAmount(r.total)}`);
  return `${label}:\n${lines.join('\n')}`;
}

export function formatRecentTransactions(rows: RecentTransactionRow[]): string {
  if (rows.length === 0) {
    return 'Последние операции:\nНет данных.';
  }
  const lines = rows.map((r) => {
    const sign = r.kind === 'income' ? '+' : '-';
    return `${sign}${formatAmount(r.amount)} ${r.categoryName} (${r.transactionDateLocal})`;
  });
  return `Последние операции:\n${lines.join('\n')}`;
}
