import type { DbPool } from '@aqsha-ai/database';
import type { ExportPeriod } from './export-matcher';

export interface ExportRow {
  date: string;        // YYYY-MM-DD
  kind: string;        // expense | income
  amount: number;
  categoryName: string;
}

/**
 * Returns date range boundaries for the requested export period.
 * All boundaries are YYYY-MM-DD strings (gte inclusive, lt exclusive).
 */
function getPeriodBounds(period: ExportPeriod): { gte: string | null; lt: string | null } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based

  if (period === 'current_month') {
    const gte = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lt  = m === 11
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 2).padStart(2, '0')}-01`;
    return { gte, lt };
  }

  if (period === 'previous_month') {
    const pm  = m === 0 ? 11 : m - 1;
    const py  = m === 0 ? y - 1 : y;
    const gte = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
    const lt  = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { gte, lt };
  }

  if (period === '3_months') {
    const d = new Date(Date.UTC(y, m - 2, 1));
    const gte = d.toISOString().slice(0, 10);
    return { gte, lt: null };
  }

  // 'all' — no date filter
  return { gte: null, lt: null };
}

const MAX_ROWS = 1000;

/**
 * Fetches confirmed transactions for CSV export.
 * Capped at 1 000 rows — sufficient for any reasonable personal history.
 * Ordered oldest → newest so the CSV reads chronologically.
 */
export async function fetchExportRows(
  db: DbPool,
  userId: string,
  period: ExportPeriod,
): Promise<{ rows: ExportRow[]; capped: boolean }> {
  const { gte, lt } = getPeriodBounds(period);

  const rows = await db<{
    date: string;
    kind: string;
    amount: string;
    category_name: string;
  }[]>`
    SELECT
      t.transaction_date_local::text AS date,
      t.kind,
      t.amount,
      c.name AS category_name
    FROM public.transactions t
    JOIN public.categories c ON c.id = t.category_id
    WHERE t.user_id    = ${userId}
      AND t.is_deleted = false
      AND t.parse_status IN ('confirmed', 'corrected')
      ${gte ? db`AND t.transaction_date_local >= ${gte}::date` : db``}
      ${lt  ? db`AND t.transaction_date_local <  ${lt}::date`  : db``}
    ORDER BY t.transaction_date_local ASC, t.transaction_at ASC
    LIMIT ${MAX_ROWS + 1}
  `;

  const capped = rows.length > MAX_ROWS;
  return {
    rows: rows.slice(0, MAX_ROWS).map((r) => ({
      date:         r.date,
      kind:         r.kind,
      amount:       Number(r.amount),
      categoryName: r.category_name,
    })),
    capped,
  };
}
