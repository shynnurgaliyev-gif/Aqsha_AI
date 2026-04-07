import type { ExportRow } from './export-repository';
import type { ExportPeriod } from './export-matcher';

const KIND_LABEL: Record<string, string> = {
  expense: 'Расход',
  income:  'Доход',
};

/** DD.MM.YYYY from YYYY-MM-DD */
function fmtDate(d: string): string {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}

const PERIOD_LABEL: Record<ExportPeriod, string> = {
  current_month:  'текущий_месяц',
  previous_month: 'прошлый_месяц',
  '3_months':     '3_месяца',
  all:            'вся_история',
};

/**
 * Builds a CSV buffer with UTF-8 BOM so Excel opens it correctly without
 * any import wizard. Semicolon separator works better than comma in
 * Russian-locale Excel (which uses comma as decimal separator).
 *
 * Format:
 *   Дата;Тип;Сумма (₸);Категория
 *   06.04.2026;Расход;500;Еда
 */
export function buildCsvBuffer(rows: ExportRow[]): Buffer {
  const BOM = '\uFEFF';
  const header = 'Дата;Тип;Сумма (₸);Категория';
  const lines = rows.map((r) => {
    const date     = fmtDate(r.date);
    const kind     = KIND_LABEL[r.kind] ?? r.kind;
    const amount   = r.amount.toString();
    const category = r.categoryName.replace(/;/g, ','); // escape semicolons in names
    return `${date};${kind};${amount};${category}`;
  });
  return Buffer.from(BOM + [header, ...lines].join('\r\n'), 'utf-8');
}

/** Filename for the Telegram document. */
export function buildFilename(period: ExportPeriod): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `aqsha_${PERIOD_LABEL[period]}_${today}.csv`;
}
