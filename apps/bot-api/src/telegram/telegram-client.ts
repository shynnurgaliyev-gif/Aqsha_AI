import type { FastifyBaseLogger } from 'fastify';

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageParams {
  chatId: number;
  text: string;
  reply_markup?: InlineKeyboardMarkup;
}

/**
 * Sends a plain text message to a Telegram chat via the Bot API.
 *
 * Error handling:
 *   - network/timeout errors  → logged, not thrown
 *   - HTTP-level errors       → logged, not thrown
 *   - Telegram API errors     → logged, not thrown
 *
 * Outbound failures must not crash the webhook request handler.
 * Telegram will not retry the original update because of a reply failure.
 */
export async function sendMessage(
  botToken: string,
  params: SendMessageParams,
  logger: FastifyBaseLogger,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
        ...(params.reply_markup ? { reply_markup: params.reply_markup } : {}),
      }),
    });
  } catch (err) {
    logger.error({ err, chatId: params.chatId }, 'Telegram sendMessage network error');
    return;
  }

  if (!response.ok) {
    logger.error({ chatId: params.chatId, status: response.status }, 'Telegram sendMessage HTTP error');
    return;
  }

  let body: { ok: boolean; error_code?: number; description?: string };
  try {
    body = (await response.json()) as typeof body;
  } catch (err) {
    logger.error({ err, chatId: params.chatId }, 'Telegram sendMessage response parse error');
    return;
  }

  if (!body.ok) {
    logger.error(
      { chatId: params.chatId, errorCode: body.error_code, description: body.description },
      'Telegram sendMessage API error',
    );
  }
}

/**
 * Sends a file document to a Telegram chat.
 * Used for CSV export — sends the buffer as a multipart upload.
 * Errors are logged and suppressed — same pattern as sendMessage.
 */
export async function sendDocument(
  botToken: string,
  params: { chatId: number; fileBuffer: Buffer; filename: string; caption?: string },
  logger: FastifyBaseLogger,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendDocument`;

  const form = new FormData();
  form.append('chat_id', String(params.chatId));
  form.append('document', new Blob([params.fileBuffer], { type: 'text/csv' }), params.filename);
  if (params.caption) form.append('caption', params.caption);

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', body: form });
  } catch (err) {
    logger.error({ err, chatId: params.chatId }, 'Telegram sendDocument network error');
    return;
  }

  if (!response.ok) {
    logger.error({ chatId: params.chatId, status: response.status }, 'Telegram sendDocument HTTP error');
    return;
  }

  let body: { ok: boolean; error_code?: number; description?: string };
  try {
    body = (await response.json()) as typeof body;
  } catch (err) {
    logger.error({ err, chatId: params.chatId }, 'Telegram sendDocument response parse error');
    return;
  }

  if (!body.ok) {
    logger.error(
      { chatId: params.chatId, errorCode: body.error_code, description: body.description },
      'Telegram sendDocument API error',
    );
  }
}

/**
 * Answers a callback query to dismiss the loading indicator on the inline button.
 * Must be called within 10 seconds of receiving the callback_query update.
 * Errors are logged and suppressed — same pattern as sendMessage.
 */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  } catch (err) {
    logger.error({ err, callbackQueryId }, 'Telegram answerCallbackQuery network error');
    return;
  }

  if (!response.ok) {
    logger.error({ callbackQueryId, status: response.status }, 'Telegram answerCallbackQuery HTTP error');
  }
}
