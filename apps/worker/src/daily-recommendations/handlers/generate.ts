import type { JobHandler } from '../../job-queue/types';
import {
  findUser,
  calculateDailyStats,
  loadUserBudgetStatuses,
  loadTopExpenseCategories,
  insertRecommendationIfNew,
  enqueueDeliveryJob,
} from '../repository';
import { calculateDaysRemaining, calculateSafeDailySpend, selectBudgetSignals } from '../calculator';
import { formatRecommendationMessage } from '../formatter';

/**
 * Handles jobs of type 'daily_recommendation_generate'.
 *
 * Flow:
 *   1. Load user — must be active with recommendations enabled and a non-expired plan.
 *   2. Calculate current-month stats and today's local date.
 *   3. Compute days remaining and safe daily spend (integer math).
 *   4. Format a compact plain-text message.
 *   5. Insert into daily_recommendations — idempotent (ON CONFLICT DO NOTHING).
 *   6. If a new row was created, enqueue a delivery stub job.
 *      If the row already existed, skip delivery enqueue (already handled).
 *
 * The job payload_json must contain 'user_id' or the job row's user_id field must be set.
 */
export const dailyRecommendationGenerateHandler: JobHandler = async (job, ctx) => {
  const { db, logger } = ctx;

  const userId = job.user_id ?? (job.payload_json.user_id as string | undefined);
  if (!userId) {
    throw new Error('daily_recommendation_generate job is missing user_id');
  }

  // ── 1. Load and validate user ─────────────────────────────────────────────
  const user = await findUser(db, userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  if (!user.is_active) {
    logger.info({ userId }, 'User inactive — skipping recommendation');
    return;
  }

  if (!user.daily_recommendations_enabled) {
    logger.info({ userId }, 'Daily recommendations disabled for user — skipping');
    return;
  }

  if (user.current_plan_status === 'expired' || user.current_plan_status === 'blocked') {
    logger.info({ userId, planStatus: user.current_plan_status }, 'User plan not eligible — skipping recommendation');
    return;
  }

  // ── 2. Calculate stats ────────────────────────────────────────────────────
  const stats = await calculateDailyStats(db, userId, user.timezone);

  // ── 3. Compute derived values ─────────────────────────────────────────────
  const daysRemaining = calculateDaysRemaining(stats.todayLocalDate);
  const safeDailySpend = calculateSafeDailySpend(stats.balance, daysRemaining);

  // ── 3b. Load budget statuses and classify signals ─────────────────────────
  const budgets = await loadUserBudgetStatuses(db, userId, user.timezone);
  const budgetSignals = selectBudgetSignals(budgets);

  // ── 3c. Load top expense categories (for insight when no budgets set) ──────
  const topExpenseCategories = await loadTopExpenseCategories(db, userId, user.timezone);

  // ── 4. Format message ─────────────────────────────────────────────────────
  const messageText = formatRecommendationMessage({
    balance: stats.balance,
    monthExpenses: stats.monthExpenses,
    monthIncome: stats.monthIncome,
    safeDailySpend,
    daysRemaining,
    budgetSignals,
    topExpenseCategories,
  });

  const payloadJson: Record<string, unknown> = {
    balance: stats.balance,
    monthExpenses: stats.monthExpenses,
    monthIncome: stats.monthIncome,
    safeDailySpend,
    daysRemaining,
    timezone: user.timezone,
    budgets: budgetSignals.map((s) => ({
      categoryName: s.categoryName,
      budgetAmount: s.budgetAmount,
      spent: s.spent,
      remaining: s.remaining,
      signal: s.kind,
    })),
  };

  // ── 5. Insert recommendation (idempotent) ─────────────────────────────────
  const recommendationId = await insertRecommendationIfNew(
    db,
    userId,
    stats.todayLocalDate,
    messageText,
    payloadJson,
  );

  if (!recommendationId) {
    logger.info({ userId, date: stats.todayLocalDate }, 'Recommendation already exists for today — skipping delivery enqueue');
    return;
  }

  // ── 6. Enqueue delivery job ───────────────────────────────────────────────
  await enqueueDeliveryJob(db, recommendationId, userId);

  logger.info(
    { userId, date: stats.todayLocalDate, recommendationId },
    'Daily recommendation generated and delivery job enqueued',
  );
};
