import type { DbPool } from '@aqsha-ai/database';

export interface UserUpsertData {
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
}

export interface DbUserRow {
  id: string;
  current_plan_status: string;
}

/**
 * Creates the user row on first contact, or updates profile fields on subsequent contacts.
 *
 * Always updates last_seen_at.
 * language_code is preserved if the incoming value is null (COALESCE).
 * Does NOT touch: is_active, onboarding_completed, timezone, daily_recommendations_*.
 *
 * The updated_at column is handled by the set_updated_at trigger.
 */
export async function upsertUser(db: DbPool, data: UserUpsertData): Promise<DbUserRow> {
  const result = await db<DbUserRow[]>`
    INSERT INTO users (
      telegram_user_id,
      telegram_username,
      first_name,
      last_name,
      language_code,
      last_seen_at
    )
    VALUES (
      ${data.telegramUserId},
      ${data.username},
      ${data.firstName},
      ${data.lastName},
      COALESCE(${data.languageCode}, 'ru'),
      now()
    )
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      telegram_username = EXCLUDED.telegram_username,
      first_name        = EXCLUDED.first_name,
      last_name         = EXCLUDED.last_name,
      language_code     = COALESCE(EXCLUDED.language_code, users.language_code),
      last_seen_at      = now()
    RETURNING id, current_plan_status
  `;

  const row = result[0];
  if (!row) {
    throw new Error(`upsertUser returned no row for telegram_user_id=${data.telegramUserId}`);
  }
  return row;
}
