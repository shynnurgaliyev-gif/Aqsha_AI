import type { JobHandler } from '../../job-queue/types';
import {
  findRecommendation,
  findUserForDelivery,
  markRecommendationSent,
  markRecommendationFailed,
  markRecommendationSkipped,
} from '../repository';
import { sendTelegramMessage } from '../../telegram/sender';

/**
 * Handles jobs of type 'daily_recommendation_deliver'.
 *
 * Flow:
 *   1. Extract recommendation_id from payload.
 *   2. Load recommendation row — throw if not found.
 *   3. Idempotency guard:
 *      - 'sent'    → already delivered, return (do not resend).
 *      - 'skipped' → terminal business decision, return.
 *      - 'pending' | 'failed' → proceed (failed enables job-level retry).
 *   4. Load user — throw if not found.
 *   5. If user inactive → mark recommendation skipped, return (job done).
 *   6. Send message via Telegram Bot API.
 *   7. On success  → mark recommendation 'sent', delivered_at = now().
 *   8. On failure  → mark recommendation 'failed', store error_text, re-throw
 *                    so the job processor marks the job failed and retries.
 *
 * Delivery target:
 *   users.telegram_user_id is the Telegram chat_id for private bot messages.
 *   This is standard Telegram Bot API behaviour — for user-initiated private chats
 *   the chat_id equals the user_id.
 */
export const dailyRecommendationDeliverHandler: JobHandler = async (job, ctx) => {
  const { db, env, logger } = ctx;

  // ── 1. Extract recommendation_id ──────────────────────────────────────────
  const recommendationId = job.payload_json.recommendation_id as string | undefined;
  if (!recommendationId) {
    throw new Error('daily_recommendation_deliver job is missing recommendation_id');
  }

  // ── 2. Load recommendation ────────────────────────────────────────────────
  const recommendation = await findRecommendation(db, recommendationId);
  if (!recommendation) {
    throw new Error(`Recommendation not found: ${recommendationId}`);
  }

  // ── 3. Idempotency guard ──────────────────────────────────────────────────
  if (recommendation.delivery_status === 'sent') {
    logger.info({ recommendationId }, 'Recommendation already sent — skipping');
    return;
  }

  if (recommendation.delivery_status === 'skipped') {
    logger.info({ recommendationId }, 'Recommendation marked skipped — not delivering');
    return;
  }

  // 'pending' and 'failed' both proceed; 'failed' allows job-level retry

  // ── 4. Load user ──────────────────────────────────────────────────────────
  const user = await findUserForDelivery(db, recommendation.user_id);
  if (!user) {
    throw new Error(`User not found for recommendation: ${recommendation.user_id}`);
  }

  // ── 5. User inactive guard ────────────────────────────────────────────────
  if (!user.is_active) {
    await markRecommendationSkipped(db, recommendationId, 'user_inactive');
    logger.info({ recommendationId, userId: recommendation.user_id }, 'User inactive — recommendation skipped');
    return;
  }

  // ── 6. Send via Telegram ──────────────────────────────────────────────────
  // telegram_user_id is bigint returned as string by postgres.js
  const chatId = Number(user.telegram_user_id);

  try {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, recommendation.message_text, logger);
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    await markRecommendationFailed(db, recommendationId, errorText);
    // Re-throw so the job processor marks the job as failed and queues a retry.
    throw err;
  }

  // ── 7. Mark sent ──────────────────────────────────────────────────────────
  await markRecommendationSent(db, recommendationId);

  logger.info(
    { recommendationId, userId: recommendation.user_id, chatId },
    'Daily recommendation delivered',
  );
};
