import type { Logger } from 'pino';

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
export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  logger: Logger,
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
    logger.error(
      { chatId, errorCode: body.error_code, description: body.description },
      'Telegram sendMessage API error',
    );
    throw new Error(`Telegram API error ${body.error_code ?? 'unknown'}: ${body.description ?? ''}`);
  }
}
