import type { JobHandler } from '../../job-queue/types';
import { findRecommendation, markRecommendationSkipped } from '../repository';

/**
 * Handles jobs of type 'daily_recommendation_deliver_stub'.
 *
 * This is a delivery stub — it validates the recommendation exists and is still
 * pending, then marks it as 'skipped' with a clear reason. Real Telegram delivery
 * will replace this stub once the delivery layer is implemented.
 *
 * Flow:
 *   1. Extract recommendation_id from payload.
 *   2. Load the recommendation row — throw if not found.
 *   3. If already delivered or skipped, log and return (idempotent).
 *   4. Mark delivery_status='skipped' with stub reason.
 */
export const dailyRecommendationDeliverStubHandler: JobHandler = async (job, ctx) => {
  const { db, logger } = ctx;

  const recommendationId = job.payload_json.recommendation_id as string | undefined;
  if (!recommendationId) {
    throw new Error('daily_recommendation_deliver_stub job is missing recommendation_id');
  }

  // ── 1. Load recommendation ────────────────────────────────────────────────
  const recommendation = await findRecommendation(db, recommendationId);
  if (!recommendation) {
    throw new Error(`Recommendation not found: ${recommendationId}`);
  }

  // ── 2. Guard — already in a terminal state ────────────────────────────────
  if (recommendation.delivery_status !== 'pending') {
    logger.info(
      { recommendationId, deliveryStatus: recommendation.delivery_status },
      'Recommendation already in terminal delivery state — skipping',
    );
    return;
  }

  // ── 3. Mark skipped (stub boundary) ──────────────────────────────────────
  await markRecommendationSkipped(db, recommendationId, 'delivery_not_implemented');

  logger.info(
    { recommendationId, userId: recommendation.user_id },
    'Delivery stub: recommendation marked skipped (real delivery not yet implemented)',
  );
};
