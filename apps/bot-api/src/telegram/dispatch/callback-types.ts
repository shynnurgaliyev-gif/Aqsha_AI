import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { HandlerOutput } from './types';

export interface CallbackDispatchContext {
  /** Raw callback_query.data — guaranteed non-empty by the dispatcher. */
  data: string;
  /** Telegram chat id where any reply must be sent. */
  chatId: number;
  /** Internal user uuid. */
  userId: string;
  db: DbPool;
  env: AppEnv;
  logger: FastifyBaseLogger;
}

/**
 * A callback handler is a (match, handle) pair. The dispatcher iterates the
 * registry, calls `match(data)` to short-circuit cheaply, and only invokes
 * `handle(ctx)` on a hit. This split keeps prefix-style handlers (rec_time:N)
 * and exact-match handlers (del_yes) interchangeable in the same array.
 */
export interface CallbackHandler {
  name: string;
  match(data: string): boolean;
  handle(ctx: CallbackDispatchContext): Promise<HandlerOutput>;
}
