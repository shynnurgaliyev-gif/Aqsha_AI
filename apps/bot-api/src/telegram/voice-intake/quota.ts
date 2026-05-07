import type { DbPool } from '@aqsha-ai/database';
import { getLocalDate } from '../analytics/period-resolver';
import { getUserTimezone } from '../analytics/analytics-repository';

/**
 * Plans that are subject to the trial quota. active / grace / pending users
 * have unlimited transcription (they are paying or in a paid grace period).
 * blocked / canceled / expired users never reach this code — the access gate
 * blocks them before voice processing.
 */
const QUOTA_APPLIES_TO = new Set(['trial']);

/**
 * Returns true if the given plan_status should have a daily voice quota.
 */
export function planHasVoiceQuota(planStatus: string): boolean {
  return QUOTA_APPLIES_TO.has(planStatus);
}

export interface VoiceQuotaResult {
  /** True if the transcription is allowed to proceed. */
  allowed: boolean;
  /** The user's count for the day BEFORE this attempt was added. */
  countBefore: number;
  /** The configured daily limit applied. */
  limit: number;
  /** The user's local date used for the quota window. */
  dateLocal: string;
}

/**
 * Atomically attempts to consume one voice transcription slot for the user.
 *
 * Race-free: a single SQL statement reads, checks the limit, and increments
 * via INSERT ... ON CONFLICT DO UPDATE ... WHERE. Concurrent voice messages
 * cannot both squeeze through when only one slot remains.
 *
 * Implementation: the INSERT inserts a fresh row with count=1 if no row exists
 * for today (first voice of the day); otherwise the ON CONFLICT branch
 * increments only if the existing count is below the limit. The WHERE filter
 * on the conflict update is what enforces the limit atomically.
 *
 * Returns:
 *   - allowed=true with countBefore = (new count - 1)
 *   - allowed=false when the existing count >= limit; countBefore reads the
 *     current value separately so the user-facing message can be specific.
 */
export async function tryConsumeVoiceQuota(
  db: DbPool,
  userId: string,
  dateLocal: string,
  limit: number,
): Promise<VoiceQuotaResult> {
  const rows = await db<{ count: number }[]>`
    INSERT INTO public.voice_usage_daily (user_id, date_local, count)
    VALUES (${userId}, ${dateLocal}::date, 1)
    ON CONFLICT (user_id, date_local) DO UPDATE
      SET count = public.voice_usage_daily.count + 1
      WHERE public.voice_usage_daily.count < ${limit}
    RETURNING count
  `;

  if (rows[0]) {
    return {
      allowed: true,
      countBefore: Number(rows[0].count) - 1,
      limit,
      dateLocal,
    };
  }

  // Conflict update WHERE failed (count already at limit). Read current value
  // for an accurate message. Safe race: a successful concurrent decrement is
  // not possible (counter is monotonic within a day).
  const cur = await db<{ count: number }[]>`
    SELECT count FROM public.voice_usage_daily
     WHERE user_id = ${userId} AND date_local = ${dateLocal}::date
  `;
  return {
    allowed: false,
    countBefore: Number(cur[0]?.count ?? limit),
    limit,
    dateLocal,
  };
}

/**
 * Resolves the user's local date and consumes a quota slot in one helper.
 * Skips the DB write entirely if the plan is exempt.
 */
export async function checkAndConsumeVoiceQuota(
  db: DbPool,
  userId: string,
  planStatus: string,
  trialDailyLimit: number,
): Promise<{ allowed: true } | { allowed: false; limit: number; dateLocal: string }> {
  if (!planHasVoiceQuota(planStatus)) {
    return { allowed: true };
  }

  const timezone = await getUserTimezone(db, userId);
  const dateLocal = getLocalDate(timezone);

  const result = await tryConsumeVoiceQuota(db, userId, dateLocal, trialDailyLimit);
  if (result.allowed) return { allowed: true };
  return { allowed: false, limit: result.limit, dateLocal: result.dateLocal };
}

/**
 * User-facing message when the daily voice quota is exhausted.
 * Hints at upgrading via the existing billing command.
 */
export function formatVoiceQuotaExceededMessage(limit: number): string {
  return (
    `🎙️ Достигнут дневной лимит голосовых сообщений (${limit} в день на trial).\n\n` +
    `Лимит обновится завтра в 00:00 по вашему времени.\n` +
    `Чтобы снять ограничение, оформите подписку — напишите «оплатить».`
  );
}

// ── Per-message duration cap ────────────────────────────────────────────────

export interface VoiceDurationLimit {
  maxSeconds: number;
  isTrial: boolean;
}

/**
 * Returns the per-message duration ceiling for the user's plan. Trial users
 * get a tighter cap; paid users a generous one. Both caps are configurable
 * via env so they can be tuned without redeploy.
 */
export function getVoiceDurationLimit(
  planStatus: string,
  trialMaxSec: number,
  paidMaxSec: number,
): VoiceDurationLimit {
  if (planHasVoiceQuota(planStatus)) {
    return { maxSeconds: trialMaxSec, isTrial: true };
  }
  return { maxSeconds: paidMaxSec, isTrial: false };
}

/**
 * Human-friendly duration formatting: "30 сек", "1 мин", "1,5 мин", "15 мин".
 * Uses comma decimal separator (Russian convention).
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} сек`;
  const minutes = seconds / 60;
  if (Number.isInteger(minutes)) return `${minutes} мин`;
  return `${minutes.toFixed(1).replace('.', ',')} мин`;
}

/**
 * User-facing message when a voice exceeds the per-message duration limit.
 */
export function formatVoiceTooLongMessage(
  durationSec: number,
  limitSec: number,
  isTrial: boolean,
): string {
  const limitFmt = formatDuration(limitSec);
  const actualFmt = formatDuration(durationSec);
  const tail = isTrial
    ? `Для trial — до ${limitFmt} на сообщение. Снять ограничение → напишите «оплатить».`
    : `Максимум — ${limitFmt} на одно голосовое.`;
  return `🎙️ Голосовое слишком длинное (${actualFmt}).\n\n${tail}`;
}
