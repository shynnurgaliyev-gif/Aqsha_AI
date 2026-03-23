import type { FastifyPluginAsync } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import {
  detectUpdateType,
  extractTelegramUserId,
  extractChatId,
  type TelegramUpdate,
} from './types';
import {
  insertOrIgnoreReceipt,
  markReceiptProcessed,
  markReceiptFailed,
} from './receipt-repository';
import { handleTelegramUpdate } from './update-handler';

/**
 * Returns a Fastify plugin that registers POST /telegram/webhook.
 *
 * Request lifecycle:
 *   1. Validate X-Telegram-Bot-Api-Secret-Token (if TELEGRAM_WEBHOOK_SECRET is set)
 *   2. Guard update_id presence
 *   3. Insert into telegram_update_receipts (ON CONFLICT DO NOTHING)
 *   4. Skip if duplicate
 *   5. Dispatch to handleTelegramUpdate
 *   6. Mark receipt processed or failed
 *   7. Always return { ok: true } to Telegram (prevents unnecessary retries)
 */
export function createWebhookRoute(env: AppEnv, db: DbPool): FastifyPluginAsync {
  return async (app) => {
    app.post('/telegram/webhook', async (request, reply) => {
      // ── 1. Secret validation ─────────────────────────────────────────────────
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const header = request.headers['x-telegram-bot-api-secret-token'];
        if (header !== env.TELEGRAM_WEBHOOK_SECRET) {
          app.log.warn('Telegram webhook request rejected — invalid secret');
          reply.code(401);
          return { ok: false, error: 'Unauthorized' };
        }
      }

      // ── 2. Guard update_id ───────────────────────────────────────────────────
      const body: unknown = request.body;
      if (
        body === null ||
        typeof body !== 'object' ||
        !('update_id' in body) ||
        typeof (body as Record<string, unknown>)['update_id'] !== 'number'
      ) {
        app.log.warn({ body }, 'Malformed Telegram update — missing update_id');
        // Return 200: a malformed payload will never become valid on retry
        return { ok: true };
      }

      const update = body as TelegramUpdate;

      // ── 3. Extract metadata ──────────────────────────────────────────────────
      const updateType = detectUpdateType(update);
      const telegramUserId = extractTelegramUserId(update);
      const chatId = extractChatId(update);

      // ── 4. Deduplicate ───────────────────────────────────────────────────────
      const isNew = await insertOrIgnoreReceipt(db, {
        updateId: update.update_id,
        telegramUserId,
        chatId,
        updateType,
        payloadJson: update,
      });

      if (!isNew) {
        app.log.warn({ updateId: update.update_id }, 'Duplicate Telegram update — ignored');
        return { ok: true };
      }

      // ── 5. Dispatch ──────────────────────────────────────────────────────────
      try {
        await handleTelegramUpdate(update, updateType, db, env, app.log);
        await markReceiptProcessed(db, update.update_id);
      } catch (err) {
        app.log.error({ err, updateId: update.update_id }, 'Unhandled error processing Telegram update');
        await markReceiptFailed(db, update.update_id, String(err));
        // Return 200: error is recorded; Telegram retrying won't help
      }

      return { ok: true };
    });
  };
}
