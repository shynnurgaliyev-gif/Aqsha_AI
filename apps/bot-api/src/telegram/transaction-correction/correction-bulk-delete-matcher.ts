export type BulkDeletePeriod = 'today' | 'yesterday' | 'current_week' | 'current_month' | 'previous_month';

export interface BulkDeleteCommand {
  period: BulkDeletePeriod;
  kind?: 'expense' | 'income';
}

function detectPeriod(t: string): BulkDeletePeriod | null {
  // previous_month must be checked before current_month
  if ((t.includes('прошл') && t.includes('месяц')) || t.includes('last month')) return 'previous_month';
  if (t.includes('сегодня') || t.includes('today')) return 'today';
  if (t.includes('вчера') || t.includes('yesterday')) return 'yesterday';
  if (t.includes('недел') || t.includes('week')) return 'current_week';
  if (t.includes('месяц') || t.includes('month')) return 'current_month';
  return null;
}

function detectKind(t: string): 'expense' | 'income' | undefined {
  if (/расход|трат/.test(t)) return 'expense';
  if (/доход|income/.test(t)) return 'income';
  return undefined;
}

/**
 * Matches bulk delete commands, e.g.:
 *   "удали все за сегодня"
 *   "удалить расходы за месяц"
 *   "очисти операции за прошлый месяц"
 *   "delete all expenses this week"
 *
 * Requires a delete-action verb at the start, plus a period keyword anywhere.
 * Single-transaction delete ("удалить последнюю") is handled earlier by
 * matchCorrectionCommand and never reaches this function.
 */
export function matchBulkDeleteCommand(text: string): BulkDeleteCommand | null {
  const t = text.toLowerCase().trim();

  const hasDeleteAction =
    t.startsWith('удали ') ||
    t.startsWith('удалить ') ||
    t.startsWith('очисти ') ||
    t.startsWith('очистить ') ||
    t.startsWith('delete ') ||
    t.startsWith('remove ');

  if (!hasDeleteAction) return null;

  const period = detectPeriod(t);
  if (!period) return null;

  const kind = detectKind(t);
  return kind !== undefined ? { period, kind } : { period };
}

export function getPeriodLabel(period: BulkDeletePeriod): string {
  switch (period) {
    case 'today':          return 'за сегодня';
    case 'yesterday':      return 'за вчера';
    case 'current_week':   return 'за эту неделю';
    case 'current_month':  return 'за этот месяц';
    case 'previous_month': return 'за прошлый месяц';
  }
}

/**
 * Computes the [from, to] date-string bounds (YYYY-MM-DD) for the given period
 * in the user's local timezone.
 */
export function getDateBounds(period: BulkDeletePeriod, timezone: string): { from: string; to: string } {
  const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());

  function shiftDay(base: string, days: number): string {
    const d = new Date(base + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  switch (period) {
    case 'today':
      return { from: todayStr, to: todayStr };

    case 'yesterday': {
      const s = shiftDay(todayStr, -1);
      return { from: s, to: s };
    }

    case 'current_week': {
      const dow = new Date(todayStr + 'T12:00:00Z').getUTCDay(); // 0=Sun
      const daysToMonday = dow === 0 ? -6 : 1 - dow;
      return { from: shiftDay(todayStr, daysToMonday), to: todayStr };
    }

    case 'current_month':
      return { from: todayStr.slice(0, 7) + '-01', to: todayStr };

    case 'previous_month': {
      const parts = todayStr.split('-');
      const year  = Number(parts[0]);
      const month = Number(parts[1]);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear  = month === 1 ? year - 1 : year;
      const mm        = String(prevMonth).padStart(2, '0');
      const lastDay   = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
      return {
        from: `${prevYear}-${mm}-01`,
        to:   `${prevYear}-${mm}-${String(lastDay).padStart(2, '0')}`,
      };
    }
  }
}
