import type { FastifyBaseLogger } from 'fastify';

export interface SendMessageParams {
  chatId: number;
  text: string;
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
