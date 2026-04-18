import type { Logger } from 'pino';

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

/**
 * Thrown when Telegram returns HTTP 403 — the user has blocked the bot.
 * Caught by the job processor to deactivate the user without retrying.
 */
export class TelegramBotBlockedError extends Error {
  public readonly chatId: number;
  constructor(chatId: number) {
    super(`Telegram HTTP 403: bot blocked by user (chatId=${chatId})`);
    this.name = 'TelegramBotBlockedError';
    this.chatId = chatId;
  }
}

/**
 * Sends a plain-text message to a Telegram chat via the Bot API.
 *
 * Unlike the bot-api outbound sender, this function THROWS on all failure modes:
 *   - network / timeout errors
 *   - HTTP-level errors
 *   - Telegram API errors
 *
 * Callers are responsible for catching the error and handling delivery state.
 * Throwing is required so the job processor can mark the job as failed and
 * allow the job queue to retry up to max_attempts.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  logger: Logger,
  rateLimitDelayMs = 0,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    logger.error({ err, chatId }, 'Telegram sendMessage network error');
    throw new Error(`Telegram network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    if (response.status === 403) throw new TelegramBotBlockedError(chatId);
    logger.error({ chatId, status: response.status }, 'Telegram sendMessage HTTP error');
    throw new Error(`Telegram HTTP ${response.status}`);
  }

  let body: { ok: boolean; error_code?: number; description?: string };
  try {
    body = (await response.json()) as typeof body;
  } catch (err) {
    logger.error({ err, chatId }, 'Telegram sendMessage response parse error');
    throw new Error('Telegram response parse error');
  }

  if (!body.ok) {
    if (body.error_code === 403) throw new TelegramBotBlockedError(chatId);
    logger.error(
      { chatId, errorCode: body.error_code, description: body.description },
      'Telegram sendMessage API error',
    );
    throw new Error(`Telegram API error ${body.error_code ?? 'unknown'}: ${body.description ?? ''}`);
  }

  if (rateLimitDelayMs > 0) await sleep(rateLimitDelayMs);
}

/**
 * Sends a message with an inline keyboard to a Telegram chat via the Bot API.
 * Same error-throwing contract as sendTelegramMessage.
 */
export async function sendTelegramMessageWithKeyboard(
  botToken: string,
  chatId: number,
  text: string,
  keyboard: InlineKeyboard,
  logger: Logger,
  rateLimitDelayMs = 0,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: keyboard }),
    });
  } catch (err) {
    logger.error({ err, chatId }, 'Telegram sendMessage (keyboard) network error');
    throw new Error(`Telegram network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    if (response.status === 403) throw new TelegramBotBlockedError(chatId);
    logger.error({ chatId, status: response.status }, 'Telegram sendMessage (keyboard) HTTP error');
    throw new Error(`Telegram HTTP ${response.status}`);
  }

  let body: { ok: boolean; error_code?: number; description?: string };
  try {
    body = (await response.json()) as typeof body;
  } catch (err) {
    logger.error({ err, chatId }, 'Telegram sendMessage (keyboard) response parse error');
    throw new Error('Telegram response parse error');
  }

  if (!body.ok) {
    if (body.error_code === 403) throw new TelegramBotBlockedError(chatId);
    logger.error(
      { chatId, errorCode: body.error_code, description: body.description },
      'Telegram sendMessage (keyboard) API error',
    );
    throw new Error(`Telegram API error ${body.error_code ?? 'unknown'}: ${body.description ?? ''}`);
  }

  if (rateLimitDelayMs > 0) await sleep(rateLimitDelayMs);
}
