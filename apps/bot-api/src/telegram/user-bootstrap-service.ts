import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramUser } from './types';
import { upsertUser } from './users-repository';
import { ensureUserSession } from './session-repository';
import { ensureTrialSubscription } from './subscription-repository';

export interface BootstrapResult {
  userId: string;
  currentPlanStatus: string;
}

/**
 * Bootstraps a Telegram user on first contact and keeps their profile current.
 *
 * On every user-originated update:
 *   1. Upsert user row (create or update profile + last_seen_at)
 *   2. Ensure user_sessions row exists
 *   3. Ensure a current trial subscription exists (no-op for existing users)
 *
 * All three operations are idempotent.
 * Call only for user-originated updates (not channel posts, not bot-to-bot).
 */
export async function bootstrapUser(
  db: DbPool,
  env: AppEnv,
  telegramUser: TelegramUser,
): Promise<BootstrapResult> {
  const user = await upsertUser(db, {
    telegramUserId: telegramUser.id,
    username: telegramUser.username ?? null,
    firstName: telegramUser.first_name ?? null,
    lastName: telegramUser.last_name ?? null,
    languageCode: telegramUser.language_code ?? null,
  });

  await ensureUserSession(db, user.id);
  await ensureTrialSubscription(db, user.id, env.TRIAL_DAYS);

  return {
    userId: user.id,
    currentPlanStatus: user.current_plan_status,
  };
}
