import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { TelegramMessage } from '../types';
import { getFilePath, downloadVoiceFile } from './file-fetcher';
import { convertToMp3 } from './audio-converter';
import { transcribeAudio } from './transcriber';

export type VoiceTranscriptResult =
  | { ok: true; transcript: string; syntheticMessage: TelegramMessage }
  | { ok: false; errorMessage: string };

/**
 * Runs the voice pipeline (size guard → download → convert → transcribe)
 * and returns the transcript + a synthetic TelegramMessage ready for full routing.
 * Does NOT call handleTextMessage — the caller decides how to route the transcript.
 */
export async function getVoiceTranscript(
  message: TelegramMessage,
  userId: string,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<VoiceTranscriptResult> {
  const voice = message.voice;

  if (!voice) {
    return { ok: false, errorMessage: 'Голосовое сообщение не найдено.' };
  }

  const maxBytes = env.MAX_VOICE_FILE_SIZE_MB * 1024 * 1024;
  // Refuse if file_size is missing — we cannot bound the cost otherwise.
  // Telegram always populates this for voice messages; absence is suspicious.
  if (voice.file_size === undefined) {
    logger.warn({ fileId: voice.file_id }, 'Voice file_size missing — refusing');
    return { ok: false, errorMessage: 'Не удалось определить размер файла. Попробуйте ещё раз.' };
  }
  if (voice.file_size > maxBytes) {
    logger.warn({ fileId: voice.file_id, fileSize: voice.file_size, maxBytes }, 'Voice file too large');
    return { ok: false, errorMessage: `Голосовое сообщение слишком большое. Максимум ${env.MAX_VOICE_FILE_SIZE_MB} МБ.` };
  }

  const filePath = await getFilePath(env.TELEGRAM_BOT_TOKEN, voice.file_id, logger);
  if (!filePath) {
    return { ok: false, errorMessage: 'Не удалось получить файл голосового сообщения.' };
  }

  const rawBuffer = await downloadVoiceFile(env.TELEGRAM_BOT_TOKEN, filePath, logger);
  if (!rawBuffer) {
    return { ok: false, errorMessage: 'Не удалось загрузить голосовое сообщение.' };
  }

  const mp3Buffer = await convertToMp3(rawBuffer, env.FFMPEG_PATH, logger);
  if (!mp3Buffer) {
    return { ok: false, errorMessage: 'Ошибка конвертации аудио.' };
  }

  const transcript = await transcribeAudio(mp3Buffer, env.OPENAI_API_KEY, env.OPENAI_TRANSCRIBE_MODEL, logger);
  if (!transcript) {
    return { ok: false, errorMessage: 'Не удалось распознать голосовое сообщение.' };
  }

  logger.info({ userId, transcript }, 'Voice transcribed');

  const syntheticMessage: TelegramMessage = {
    message_id: message.message_id,
    ...(message.from !== undefined ? { from: message.from } : {}),
    chat: message.chat,
    date: message.date,
    text: transcript,
  };

  return { ok: true, transcript, syntheticMessage };
}
