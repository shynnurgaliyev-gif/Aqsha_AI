import type { AnalyticsPeriod } from './query-matcher';
import type { DateRange } from './period-resolver';
import type { BalanceSummary, CategoryTotalRow, RecentTransactionRow } from './analytics-repository';

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

/** Converts YYYY-MM-DD → DD.MM */
function fmtDateShort(dateStr: string): string {
  return `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`;
}

/** Converts YYYY-MM-DD → DD.MM.YYYY */
function fmtDateFull(dateStr: string): string {
  return `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}.${dateStr.slice(0, 4)}`;
}

/** Returns the last inclusive day (lt − 1 day) as YYYY-MM-DD. */
function lastInclusiveDay(lt: string): string {
  const d = new Date(`${lt}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function formatBalance({ balance, totalIncome, totalExpense }: BalanceSummary): string {
  const sign = balance >= 0 ? '+' : '';
  return [
    `📈 Доходы (всего): ${formatAmount(totalIncome)}`,
    `📉 Расходы (всего): ${formatAmount(totalExpense)}`,
    ``,
    `💼 Баланс: ${sign}${formatAmount(balance)}`,
  ].join('\n');
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

/** Category breakdown formatter with date range, totals, and percentages. */
export function formatCategoryBreakdownByPeriod(
  kind: 'expense' | 'income',
  rows: CategoryTotalRow[],
  range: DateRange,
): string {
  const headerEmoji = kind === 'expense' ? '📊' : '📈';
  const kindLabel = kind === 'expense' ? 'Расходы' : 'Доходы';
  const totalEmoji = kind === 'expense' ? '💸' : '💰';
  const totalLabel = kind === 'expense' ? 'Итого потрачено' : 'Итого получено';
  const sectionLabel = kind === 'expense' ? 'По категориям' : 'По источникам';

  const end = lastInclusiveDay(range.lt);
  const header = `${headerEmoji} ${kindLabel} за ${fmtDateShort(range.gte)} — ${fmtDateFull(end)}:`;

  if (rows.length === 0) {
    return `${header}\nНет данных за этот период.`;
  }

  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const count = rows.reduce((sum, r) => sum + r.count, 0);

  const lines = rows.map((r) => {
    const pct = total > 0 ? Math.round((r.total / total) * 100) : 0;
    return `• ${r.categoryName}: ${formatAmount(r.total)} (${pct}%)`;
  });

  return [
    header,
    `${totalEmoji} ${totalLabel}: ${formatAmount(total)}`,
    '',
    `${sectionLabel}:`,
    ...lines,
    '',
    `📝 Записей: ${count}`,
  ].join('\n');
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
