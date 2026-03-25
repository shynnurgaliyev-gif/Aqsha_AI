import type { AnalyticsPeriod } from './query-matcher';
import type { CategoryTotalRow, RecentTransactionRow } from './analytics-repository';

function formatAmount(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

/** Human-readable period label for use in response text. */
function periodLabel(period: AnalyticsPeriod): string {
  switch (period) {
    case 'current_month': return 'этот месяц';
    case 'today':         return 'сегодня';
    case 'yesterday':     return 'вчера';
    case 'current_week':  return 'эта неделя';
    case 'previous_month': return 'прошлый месяц';
  }
}

export function formatBalance(balance: number): string {
  const sign = balance >= 0 ? '+' : '';
  return `Баланс: ${sign}${formatAmount(balance)}`;
}

/** Period-aware total formatter. Covers all supported periods. */
export function formatPeriodTotal(
  kind: 'expense' | 'income',
  total: number,
  period: AnalyticsPeriod,
): string {
  const kindLabel = kind === 'expense' ? 'Расходы' : 'Доходы';
  return `${kindLabel} (${periodLabel(period)}): ${formatAmount(total)}`;
}

/** Period-aware category breakdown formatter. Covers all supported periods. */
export function formatCategoryBreakdownByPeriod(
  kind: 'expense' | 'income',
  rows: CategoryTotalRow[],
  period: AnalyticsPeriod,
): string {
  const kindLabel = kind === 'expense' ? 'Расходы' : 'Доходы';
  const header = `${kindLabel} по категориям (${periodLabel(period)})`;
  if (rows.length === 0) {
    return `${header}:\nНет данных.`;
  }
  const lines = rows.map((r, i) => `${i + 1}. ${r.categoryName} — ${formatAmount(r.total)}`);
  return `${header}:\n${lines.join('\n')}`;
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
