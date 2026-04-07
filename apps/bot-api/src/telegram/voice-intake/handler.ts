import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramMessage } from '../types';
import { handleTextMessage } from '../text-intake/handler';
import type { IntakeResult } from '../text-intake/response';
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
  if (voice.file_size !== undefined && voice.file_size > maxBytes) {
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

/**
 * Handles an incoming Telegram voice message.
 *
 * Pipeline:
 *   1. Size guard — reject files larger than MAX_VOICE_FILE_SIZE_MB
 *   2. Resolve file_path via Telegram getFile API
 *   3. Download raw voice buffer from Telegram CDN
 *   4. Convert to MP3 via ffmpeg (stdin→stdout, no temp files)
 *   5. Transcribe with OpenAI Whisper
 *   6. Feed transcript into existing text intake handler (reuses draft/confirm flow)
 *
 * Returns an IntakeResult for the caller to send to the user.
 * Returns an error result on any pipeline failure.
 */
export async function handleVoiceMessage(
  message: TelegramMessage,
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<IntakeResult> {
  const voice = message.voice;

  if (!voice) {
    return { kind: 'unsupported', message: 'Голосовое сообщение не найдено.' };
  }

  // ── 1. Size guard ────────────────────────────────────────────────────────────
  const maxBytes = env.MAX_VOICE_FILE_SIZE_MB * 1024 * 1024;
  if (voice.file_size !== undefined && voice.file_size > maxBytes) {
    logger.warn({ fileId: voice.file_id, fileSize: voice.file_size, maxBytes }, 'Voice file too large');
    return {
      kind: 'unsupported',
      message: `Голосовое сообщение слишком большое. Максимум ${env.MAX_VOICE_FILE_SIZE_MB} МБ.`,
    };
  }

  // ── 2. Resolve file_path ─────────────────────────────────────────────────────
  const filePath = await getFilePath(env.TELEGRAM_BOT_TOKEN, voice.file_id, logger);
  if (!filePath) {
    return { kind: 'unsupported', message: 'Не удалось получить файл голосового сообщения.' };
  }

  // ── 3. Download ──────────────────────────────────────────────────────────────
  const rawBuffer = await downloadVoiceFile(env.TELEGRAM_BOT_TOKEN, filePath, logger);
  if (!rawBuffer) {
    return { kind: 'unsupported', message: 'Не удалось загрузить голосовое сообщение.' };
  }

  // ── 4. Convert to MP3 ────────────────────────────────────────────────────────
  const mp3Buffer = await convertToMp3(rawBuffer, env.FFMPEG_PATH, logger);
  if (!mp3Buffer) {
    return { kind: 'unsupported', message: 'Ошибка конвертации аудио.' };
  }

  // ── 5. Transcribe ────────────────────────────────────────────────────────────
  const transcript = await transcribeAudio(mp3Buffer, env.OPENAI_API_KEY, env.OPENAI_TRANSCRIBE_MODEL, logger);
  if (!transcript) {
    return { kind: 'unsupported', message: 'Не удалось распознать голосовое сообщение.' };
  }

  logger.info({ userId, transcript }, 'Voice transcribed');

  // ── 6. Feed into text intake ─────────────────────────────────────────────────
  // Construct a synthetic TelegramMessage with the transcript as text so the
  // existing draft/confirm flow is reused without duplication.
  const syntheticMessage: TelegramMessage = {
    message_id: message.message_id,
    ...(message.from !== undefined ? { from: message.from } : {}),
    chat: message.chat,
    date: message.date,
    text: transcript,
  };

  return handleTextMessage(syntheticMessage, userId, db, env, logger);
}
