import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { verifyTelegramInitData } from '../../src/telegram/mini-app/mini-auth';

const BOT_TOKEN = '1234567890:test-token';

/**
 * Builds a valid Telegram initData URL-encoded string for the given bot token.
 * Mirrors the Telegram WebApp algorithm so we can sign canned payloads.
 */
function buildSignedInitData(
  fields: Record<string, string>,
  botToken = BOT_TOKEN,
): string {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

describe('verifyTelegramInitData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-05-08 06:00:00 UTC
    vi.setSystemTime(new Date('2026-05-08T06:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('valid signatures', () => {
    it('accepts a freshly signed payload', () => {
      const authDate = Math.floor(Date.now() / 1000); // now
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: JSON.stringify({ id: 12345, first_name: 'Alice' }),
      });

      const result = verifyTelegramInitData(initData, BOT_TOKEN);
      expect(result).not.toBeNull();
      expect(result?.user.id).toBe(12345);
      expect(result?.user.first_name).toBe('Alice');
      expect(result?.auth_date).toBe(authDate);
    });

    it('returns user with optional fields', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: JSON.stringify({
          id: 99,
          first_name: 'Bob',
          last_name: 'Smith',
          username: 'bobsmith',
          language_code: 'ru',
        }),
      });
      const result = verifyTelegramInitData(initData, BOT_TOKEN);
      expect(result?.user.username).toBe('bobsmith');
      expect(result?.user.language_code).toBe('ru');
    });
  });

  describe('rejects tampered payloads', () => {
    it('rejects when hash is wrong', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: JSON.stringify({ id: 1, first_name: 'A' }),
      });
      // Replace hash with garbage of correct length (64 hex chars).
      const tampered = initData.replace(/hash=[a-f0-9]{64}/, `hash=${'0'.repeat(64)}`);
      expect(verifyTelegramInitData(tampered, BOT_TOKEN)).toBeNull();
    });

    it('rejects when payload was signed with a different bot token', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const initData = buildSignedInitData(
        {
          auth_date: String(authDate),
          user: JSON.stringify({ id: 1, first_name: 'A' }),
        },
        'other-bot-token',
      );
      expect(verifyTelegramInitData(initData, BOT_TOKEN)).toBeNull();
    });

    it('rejects when a field was modified after signing', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: JSON.stringify({ id: 1, first_name: 'A' }),
      });
      // Change user.id from 1 → 999 without resigning.
      const tampered = initData.replace(
        encodeURIComponent('{"id":1,"first_name":"A"}'),
        encodeURIComponent('{"id":999,"first_name":"A"}'),
      );
      expect(verifyTelegramInitData(tampered, BOT_TOKEN)).toBeNull();
    });
  });

  describe('rejects malformed input', () => {
    it('returns null for empty string', () => {
      expect(verifyTelegramInitData('', BOT_TOKEN)).toBeNull();
    });

    it('returns null when hash is missing', () => {
      expect(verifyTelegramInitData('auth_date=123&user={}', BOT_TOKEN)).toBeNull();
    });

    it('returns null when hash has wrong length', () => {
      expect(verifyTelegramInitData('auth_date=123&hash=tooshort', BOT_TOKEN)).toBeNull();
    });

    it('returns null when auth_date is missing', () => {
      const initData = buildSignedInitData({
        user: JSON.stringify({ id: 1, first_name: 'A' }),
      });
      expect(verifyTelegramInitData(initData, BOT_TOKEN)).toBeNull();
    });

    it('returns null when user field is missing', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const initData = buildSignedInitData({ auth_date: String(authDate) });
      expect(verifyTelegramInitData(initData, BOT_TOKEN)).toBeNull();
    });

    it('returns null when user JSON is malformed', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: 'not-json',
      });
      expect(verifyTelegramInitData(initData, BOT_TOKEN)).toBeNull();
    });

    it('returns null when user lacks id', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: JSON.stringify({ first_name: 'NoId' }),
      });
      expect(verifyTelegramInitData(initData, BOT_TOKEN)).toBeNull();
    });
  });

  describe('age (replay) protection', () => {
    it('rejects payloads older than maxAgeSeconds', () => {
      // Signed 2 hours ago, default maxAge is 1 hour
      const authDate = Math.floor(Date.now() / 1000) - 7200;
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: JSON.stringify({ id: 1, first_name: 'A' }),
      });
      expect(verifyTelegramInitData(initData, BOT_TOKEN)).toBeNull();
    });

    it('accepts payloads within the default 1-hour window', () => {
      const authDate = Math.floor(Date.now() / 1000) - 1800; // 30 min ago
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: JSON.stringify({ id: 1, first_name: 'A' }),
      });
      expect(verifyTelegramInitData(initData, BOT_TOKEN)).not.toBeNull();
    });

    it('respects custom maxAgeSeconds override', () => {
      const authDate = Math.floor(Date.now() / 1000) - 30; // 30 sec ago
      const initData = buildSignedInitData({
        auth_date: String(authDate),
        user: JSON.stringify({ id: 1, first_name: 'A' }),
      });
      // 10 second window — should reject
      expect(verifyTelegramInitData(initData, BOT_TOKEN, 10)).toBeNull();
      // 60 second window — should accept
      expect(verifyTelegramInitData(initData, BOT_TOKEN, 60)).not.toBeNull();
    });
  });
});
