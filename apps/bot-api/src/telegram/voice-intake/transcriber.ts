import type { FastifyBaseLogger } from 'fastify';

/**
 * Sends an MP3 buffer to the OpenAI Whisper transcription endpoint.
 * Returns the transcript string, or null on any error.
 */
export async function transcribeAudio(
  mp3Buffer: Buffer,
  apiKey: string,
  model: string,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', new Blob([mp3Buffer], { type: 'audio/mpeg' }), 'audio.mp3');
  formData.append('model', model);
  formData.append('response_format', 'text');

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
  } catch (err) {
    logger.error({ err }, 'Whisper transcription network error');
    return null;
  }

  if (!response.ok) {
    logger.error({ status: response.status }, 'Whisper transcription HTTP error');
    return null;
  }

  let text: string;
  try {
    text = (await response.text()).trim();
  } catch (err) {
    logger.error({ err }, 'Whisper transcription response read error');
    return null;
  }

  if (!text) {
    logger.warn('Whisper returned empty transcript');
    return null;
  }

  return text;
}
