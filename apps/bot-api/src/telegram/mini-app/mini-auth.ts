import crypto from 'node:crypto';

export interface TgInitDataUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface VerifiedInitData {
  user: TgInitDataUser;
  auth_date: number;
}

/**
 * Verifies Telegram Mini App initData using HMAC-SHA256.
 *
 * Algorithm per Telegram docs:
 *   secret_key = HMAC-SHA256("WebAppData", bot_token)
 *   data_check_string = sorted key=value pairs (excluding hash) joined by \n
 *   expected_hash = HMAC-SHA256(data_check_string, secret_key)
 *
 * Returns null if:
 *   - hash is missing or invalid
 *   - auth_date is missing or older than maxAgeSeconds
 *   - user field is missing or unparseable
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 3600, // 1 hour — Telegram's recommended replay window
): VerifiedInitData | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || hash.length !== 64) return null;

    const authDate = Number(params.get('auth_date'));
    if (!authDate) return null;
    if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) return null;

    params.delete('hash');

    const checkString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'))) {
      return null;
    }

    const userJson = params.get('user');
    if (!userJson) return null;
    const user = JSON.parse(userJson) as TgInitDataUser;
    if (!user?.id) return null;

    return { user, auth_date: authDate };
  } catch {
    return null;
  }
}
