/**
 * Telegram webhook registration helpers.
 *
 * Unlike telegram-client.ts (which swallows errors to avoid crashing request handlers),
 * these functions THROW on all failure modes. They are called at startup where a failure
 * should abort the process so Render can surface the error and retry the deploy.
 *
 * Usage at startup:
 *   if (env.TELEGRAM_WEBHOOK_URL) {
 *     await setWebhook(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_WEBHOOK_URL, env.TELEGRAM_WEBHOOK_SECRET);
 *   }
 */

const TELEGRAM_API = 'https://api.telegram.org';

interface TelegramApiResponse {
  ok: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
}

async function callTelegramApi(botToken: string, method: string, body: Record<string, unknown>): Promise<void> {
  const url = `${TELEGRAM_API}/bot${botToken}/${method}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Telegram ${method} network error: ${String(err)}`);
  }

  if (!response.ok) {
    throw new Error(`Telegram ${method} HTTP ${response.status}`);
  }

  let data: TelegramApiResponse;
  try {
    data = (await response.json()) as TelegramApiResponse;
  } catch (err) {
    throw new Error(`Telegram ${method} response parse error: ${String(err)}`);
  }

  if (!data.ok) {
    throw new Error(
      `Telegram ${method} API error ${data.error_code ?? 'unknown'}: ${data.description ?? 'no description'}`,
    );
  }
}

/**
 * Registers the bot webhook with Telegram.
 *
 * Idempotent — safe to call on every startup. Telegram accepts re-registration
 * of an already-registered URL without error.
 *
 * @param botToken         TELEGRAM_BOT_TOKEN
 * @param webhookUrl       Public HTTPS URL Telegram will POST updates to
 * @param secretToken      Optional TELEGRAM_WEBHOOK_SECRET sent as X-Telegram-Bot-Api-Secret-Token
 */
export async function setWebhook(botToken: string, webhookUrl: string, secretToken?: string): Promise<void> {
  const body: Record<string, unknown> = {
    url: webhookUrl,
    // Restrict to update types the bot currently handles
    allowed_updates: ['message', 'callback_query'],
  };

  if (secretToken) {
    body['secret_token'] = secretToken;
  }

  await callTelegramApi(botToken, 'setWebhook', body);
}

/**
 * Removes the bot webhook, switching the bot to polling mode.
 *
 * Only needed for local development or when switching away from webhook mode.
 * Not called during normal production startup.
 *
 * @param botToken  TELEGRAM_BOT_TOKEN
 */
export async function deleteWebhook(botToken: string): Promise<void> {
  await callTelegramApi(botToken, 'deleteWebhook', { drop_pending_updates: false });
}
