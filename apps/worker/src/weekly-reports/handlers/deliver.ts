import type { JobHandler } from '../../job-queue/types';
import {
  findWeeklyReport,
  findUserForDelivery,
  markWeeklyReportSent,
  markWeeklyReportFailed,
  markWeeklyReportSkipped,
} from '../repository';
import { sendTelegramMessage } from '../../telegram/sender';

/**
 * Handles jobs of type 'weekly_report_deliver'.
 *
 * Flow:
 *   1. Extract report_id from payload.
 *   2. Load weekly_reports row — throw if not found.
 *   3. Idempotency guard: 'sent' | 'skipped' → return; 'pending' | 'failed' → proceed.
 *   4. Load user — throw if not found.
 *   5. If user inactive → mark report skipped, return.
 *   6. Send message via Telegram Bot API.
 *   7. On success → mark report 'sent'.
 *   8. On failure → mark report 'failed', re-throw for job-level retry.
 */
export const weeklyReportDeliverHandler: JobHandler = async (job, ctx) => {
  const { db, env, logger } = ctx;

  // ── 1. Extract report_id ──────────────────────────────────────────────────
  const reportId = job.payload_json.report_id as string | undefined;
  if (!reportId) {
    throw new Error('weekly_report_deliver job is missing report_id');
  }

  // ── 2. Load report ────────────────────────────────────────────────────────
  const report = await findWeeklyReport(db, reportId);
  if (!report) {
    throw new Error(`Weekly report not found: ${reportId}`);
  }

  // ── 3. Idempotency guard ──────────────────────────────────────────────────
  if (report.delivery_status === 'sent') {
    logger.info({ reportId }, 'Weekly report already sent — skipping');
    return;
  }
  if (report.delivery_status === 'skipped') {
    logger.info({ reportId }, 'Weekly report marked skipped — not delivering');
    return;
  }

  // ── 4. Load user ──────────────────────────────────────────────────────────
  const user = await findUserForDelivery(db, report.user_id);
  if (!user) {
    throw new Error(`User not found for weekly report: ${report.user_id}`);
  }

  // ── 5. User inactive guard ────────────────────────────────────────────────
  if (!user.is_active) {
    await markWeeklyReportSkipped(db, reportId, 'user_inactive');
    logger.info({ reportId, userId: report.user_id }, 'User inactive — weekly report skipped');
    return;
  }

  // ── 6. Send via Telegram ──────────────────────────────────────────────────
  const chatId = Number(user.telegram_user_id);

  try {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, report.message_text, logger);
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    await markWeeklyReportFailed(db, reportId, errorText);
    throw err;
  }

  // ── 7. Mark sent ──────────────────────────────────────────────────────────
  await markWeeklyReportSent(db, reportId);

  logger.info(
    { reportId, userId: report.user_id, chatId },
    'Weekly report delivered',
  );
};
