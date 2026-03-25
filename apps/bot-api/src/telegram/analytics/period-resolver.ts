import type { AnalyticsPeriod } from './query-matcher';

/**
 * Default IANA timezone used when a user has no timezone set or the stored
 * value is invalid. Matches the DEFAULT on public.users.timezone.
 */
export const FALLBACK_TIMEZONE = 'Asia/Almaty';

/**
 * An explicit date range for SQL queries against transaction_date_local.
 * gte is inclusive, lt is exclusive. Both are YYYY-MM-DD strings.
 */
export interface DateRange {
  /** Inclusive lower bound — YYYY-MM-DD. */
  gte: string;
  /** Exclusive upper bound — YYYY-MM-DD. */
  lt: string;
}

/**
 * Returns the current date in the given IANA timezone as a YYYY-MM-DD string.
 *
 * Uses Intl.DateTimeFormat with formatToParts to extract year/month/day
 * independently of locale date-order conventions.
 *
 * Falls back to FALLBACK_TIMEZONE if the provided timezone is invalid,
 * then to UTC as a last resort (should never be needed in practice).
 */
function getLocalDate(timezone: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year  = parts.find(p => p.type === 'year')?.value ?? '';
    const month = parts.find(p => p.type === 'month')?.value ?? '';
    const day   = parts.find(p => p.type === 'day')?.value ?? '';
    if (year.length !== 4 || month.length !== 2 || day.length !== 2) {
      throw new Error('unexpected date part format');
    }
    return `${year}-${month}-${day}`;
  } catch {
    if (timezone !== FALLBACK_TIMEZONE) {
      return getLocalDate(FALLBACK_TIMEZONE);
    }
    // Last resort: UTC date string
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Adds delta calendar days to a YYYY-MM-DD date string.
 * Arithmetic is performed in UTC midnight to avoid DST shifts.
 */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Returns the first day of the month containing dateStr (YYYY-MM-01). */
function monthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

/** Returns the first day of the month after the one containing dateStr. */
function nextMonthStart(dateStr: string): string {
  const year  = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/**
 * Returns the Monday of the ISO week containing dateStr (YYYY-MM-DD).
 * ISO 8601 week: Monday = first day, Sunday = last day.
 * Matches PostgreSQL's date_trunc('week', ...) definition.
 */
function isoWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday, 1 = Monday, …, 6 = Saturday
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  return addDays(dateStr, -daysFromMonday);
}

/**
 * Resolves an analytics period to an explicit [gte, lt) date range using the
 * user's local date as the reference point.
 *
 * All boundaries are derived from the user's current local date, so queries
 * for "today" or "this week" respect the user's timezone rather than the
 * server's current_date.
 *
 * Period semantics:
 * - today          → user's current local calendar day
 * - yesterday      → the calendar day before the user's local today
 * - current_week   → ISO week (Mon–Sun) containing the user's local today
 * - current_month  → calendar month containing the user's local today
 * - previous_month → the calendar month before the user's current local month
 */
export function resolvePeriodRange(period: AnalyticsPeriod, timezone: string): DateRange {
  const today = getLocalDate(timezone);

  switch (period) {
    case 'today':
      return { gte: today, lt: addDays(today, 1) };

    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { gte: yesterday, lt: today };
    }

    case 'current_week': {
      const weekStart = isoWeekStart(today);
      return { gte: weekStart, lt: addDays(weekStart, 7) };
    }

    case 'current_month':
      return { gte: monthStart(today), lt: nextMonthStart(today) };

    case 'previous_month': {
      const thisMonthStart = monthStart(today);
      // Step one day back from the 1st of this month to land inside last month
      const lastMonthAny = addDays(thisMonthStart, -1);
      return { gte: monthStart(lastMonthAny), lt: thisMonthStart };
    }
  }
}
