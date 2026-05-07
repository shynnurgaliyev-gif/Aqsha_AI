import type { FastifyBaseLogger } from 'fastify';

/**
 * Resolves a Telegram file_id to a downloadable file_path via the Bot API getFile method.
 * Returns null on any error.
 */
export async function getFilePath(
  botToken: string,
  fileId: string,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const url = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    logger.error({ err, fileId }, 'Telegram getFile network error');
    return null;
  }

  if (!response.ok) {
    logger.error({ fileId, status: response.status }, 'Telegram getFile HTTP error');
    return null;
  }

  let body: { ok: boolean; result?: { file_path?: string } };
  try {
    body = (await response.json()) as typeof body;
  } catch (err) {
    logger.error({ err, fileId }, 'Telegram getFile response parse error');
    return null;
  }

  if (!body.ok || !body.result?.file_path) {
    logger.error({ fileId }, 'Telegram getFile API error or missing file_path');
    return null;
  }

  return body.result.file_path;
}

/**
 * Downloads a Telegram file by its file_path into a Buffer.
 * Returns null on any error.
 */
export async function downloadVoiceFile(
  botToken: string,
  filePath: string,
  logger: FastifyBaseLogger,
): Promise<Buffer | null> {
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    logger.error({ err, filePath }, 'Telegram file download network error');
    return null;
  }

  if (!response.ok) {
    logger.error({ filePath, status: response.status }, 'Telegram file download HTTP error');
    return null;
  }

  try {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error({ err, filePath }, 'Telegram file download read error');
    return null;
  }
}
