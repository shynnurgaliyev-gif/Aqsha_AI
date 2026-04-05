import type { JobHandler } from '../../job-queue/types';
import {
  findUser,
  calculateWeeklyStats,
  loadTopCategoriesThisWeek,
  insertWeeklyReportIfNew,
  enqueueWeeklyReportDeliveryJob,
} from '../repository';
import { formatWeeklyReport } from '../formatter';

/**
 * Handles jobs of type 'weekly_report_generate'.
 *
 * Flow:
 *   1. Load user — must be active with a non-expired plan.
 *   2. Calculate weekly stats (this week + last week).
 *   3. Load top expense categories for this week.
 *   4. Format the report message.
 *   5. Insert into weekly_reports — idempotent (ON CONFLICT DO NOTHING).
 *   6. If a new row was created, enqueue a delivery job.
 */
export const weeklyReportGenerateHandler: JobHandler = async (job, ctx) => {
  const { db, logger } = ctx;

  const userId = job.user_id ?? (job.payload_json.user_id as string | undefined);
  if (!userId) {
    throw new Error('weekly_report_generate job is missing user_id');
  }

  // ── 1. Load and validate user ─────────────────────────────────────────────
  const user = await findUser(db, userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  if (!user.is_active) {
    logger.info({ userId }, 'User inactive — skipping weekly report');
    return;
  }

  if (user.current_plan_status === 'expired' || user.current_plan_status === 'blocked') {
    logger.info({ userId, planStatus: user.current_plan_status }, 'User plan not eligible — skipping weekly report');
    return;
  }

  // ── 2. Calculate weekly stats ─────────────────────────────────────────────
  const stats = await calculateWeeklyStats(db, userId, user.timezone);

  // ── 3. Load top categories ────────────────────────────────────────────────
  const topCategories = await loadTopCategoriesThisWeek(
    db,
    userId,
    stats.weekStartDate,
    stats.todayLocalDate,
  );

  // ── 4. Format message ─────────────────────────────────────────────────────
  const messageText = formatWeeklyReport({ stats, topCategories });

  const payloadJson: Record<string, unknown> = {
    weekStartDate: stats.weekStartDate,
    thisWeekExpenses: stats.thisWeekExpenses,
    thisWeekIncome: stats.thisWeekIncome,
    lastWeekExpenses: stats.lastWeekExpenses,
    lastWeekIncome: stats.lastWeekIncome,
    timezone: user.timezone,
  };

  // ── 5. Insert report (idempotent) ─────────────────────────────────────────
  const reportId = await insertWeeklyReportIfNew(
    db,
    userId,
    stats.weekStartDate,
    messageText,
    payloadJson,
  );

  if (!reportId) {
    logger.info({ userId, weekStartDate: stats.weekStartDate }, 'Weekly report already exists for this week — skipping delivery enqueue');
    return;
  }

  // ── 6. Enqueue delivery job ───────────────────────────────────────────────
  await enqueueWeeklyReportDeliveryJob(db, reportId, userId);

  logger.info(
    { userId, weekStartDate: stats.weekStartDate, reportId },
    'Weekly report generated and delivery job enqueued',
  );
};
