import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import type { ExportPeriod } from './export-matcher';
import { fetchExportRows } from './export-repository';
import { buildCsvBuffer, buildFilename } from './export-formatter';

/**
 * Generates a CSV export for the given period and returns a ready-to-send buffer.
 * Returns null on DB error (caller should send an error message to the user).
 */
export async function handleExportRequest(
  userId: string,
  period: ExportPeriod,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<{ buffer: Buffer; filename: string; caption: string } | null> {
  let result: Awaited<ReturnType<typeof fetchExportRows>>;

  try {
    result = await fetchExportRows(db, userId, period);
  } catch (err) {
    logger.error({ err, userId, period }, 'Export: DB query failed');
    return null;
  }

  if (result.rows.length === 0) {
    return null; // caller sends "нет данных" message
  }

  const buffer   = buildCsvBuffer(result.rows);
  const filename = buildFilename(period);

  const cappedNote = result.capped ? ' (показаны первые 1 000 записей)' : '';
  const caption = `📊 Выгружено ${result.rows.length} операций${cappedNote}`;

  logger.info({ userId, period, rows: result.rows.length, capped: result.capped }, 'Export: CSV generated');

  return { buffer, filename, caption };
}
