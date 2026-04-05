import type { WeeklyStats, WeekCategoryRow } from './repository';

function fmt(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

function fmtDate(dateStr: string): string {
  // dateStr is 'YYYY-MM-DD'
  const [, m, d] = dateStr.split('-');
  const months = [
    'янв', 'фев', 'мар', 'апр', 'май', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ];
  return `${parseInt(d!, 10)} ${months[parseInt(m!, 10) - 1]}`;
}

export interface WeeklyReportParams {
  stats: WeeklyStats;
  topCategories: WeekCategoryRow[];
}

export function formatWeeklyReport({ stats, topCategories }: WeeklyReportParams): string {
  const { weekStartDate, todayLocalDate, thisWeekExpenses, thisWeekIncome, lastWeekExpenses } = stats;

  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(`📊 Недельный отчёт (${fmtDate(weekStartDate)} — ${fmtDate(todayLocalDate)})`);
  lines.push('');

  // ── Totals ───────────────────────────────────────────────────────────────────
  lines.push(`💸 Расходы за неделю: ${fmt(thisWeekExpenses)}`);
  lines.push(`💰 Доходы за неделю: ${fmt(thisWeekIncome)}`);
  lines.push('');

  // ── Comparison with last week ────────────────────────────────────────────────
  if (lastWeekExpenses > 0 || thisWeekExpenses > 0) {
    const diff = thisWeekExpenses - lastWeekExpenses;
    if (diff > 0) {
      lines.push(`📈 На ${fmt(diff)} больше, чем прошлая неделя (${fmt(lastWeekExpenses)})`);
    } else if (diff < 0) {
      lines.push(`📉 На ${fmt(Math.abs(diff))} меньше, чем прошлая неделя (${fmt(lastWeekExpenses)})`);
    } else {
      lines.push(`↔️ Столько же, сколько прошлая неделя (${fmt(lastWeekExpenses)})`);
    }
    lines.push('');
  }

  // ── Top categories ───────────────────────────────────────────────────────────
  if (topCategories.length > 0) {
    lines.push('Топ расходов:');
    for (const cat of topCategories) {
      const pct = thisWeekExpenses > 0 ? Math.round((cat.total / thisWeekExpenses) * 100) : 0;
      lines.push(`• ${cat.categoryName} — ${fmt(cat.total)} (${pct}%)`);
    }
  } else if (thisWeekExpenses === 0) {
    lines.push('На этой неделе расходов не было. Отличный результат! 🎉');
  }

  return lines.join('\n');
}
