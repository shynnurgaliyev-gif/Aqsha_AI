import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { TelegramMessage } from '../types';
import type { InlineKeyboardMarkup } from '../telegram-client';

/**
 * Result of a single TextHandler attempt.
 *
 *   pass  — handler was not applicable; the dispatcher should try the next.
 *   sent  — handler already sent its reply (and any side effects); dispatcher stops.
 *   reply — handler produced a reply; dispatcher sends it then stops.
 *
 * The split between `sent` and `reply` exists because some handlers do
 * complex post-processing (e.g., sending multiple messages or attaching
 * dynamic keyboards based on side effects). They take ownership of sending.
 * Most handlers return a simple `reply`.
 */
export type HandlerOutput =
  | { kind: 'pass' }
  | { kind: 'sent' }
  | { kind: 'reply'; text: string; reply_markup?: InlineKeyboardMarkup };

export interface TextDispatchContext {
  /** Trimmed text payload (typed message text or voice transcript). */
  text: string;
  /** Original Telegram message (or synthesised one for voice). */
  msg: TelegramMessage;
  /** Telegram chat id where replies must be sent. */
  chatId: number;
  /** Internal user uuid. */
  userId: string;
  db: DbPool;
  env: AppEnv;
  logger: FastifyBaseLogger;
}

export interface TextHandler {
  /** Stable identifier — used in logs to attribute who handled the message. */
  name: string;
  tryHandle(ctx: TextDispatchContext): Promise<HandlerOutput>;
}

/** Reusable singletons to avoid allocations in the hot path. */
export const PASS: HandlerOutput = { kind: 'pass' };
export const SENT: HandlerOutput = { kind: 'sent' };
