import type { DbPool } from '@aqsha-ai/database';
import type { FastifyBaseLogger } from 'fastify';
import { matchResetCommand } from './reset-matcher';
import { getPendingReset, setPendingReset, clearPendingReset } from './reset-session';
import { softDeleteAllTransactions } from './reset-repository';
import {
  RESET_CONFIRM_PROMPT,
  RESET_CANCELLED,
  RESET_SUCCESS,
} from './reset-formatter';

const CONFIRM_WORD = 'УДАЛИТЬ';

/**
 * Handles the full reset flow:
 *   1. User types a reset command → show warning + ask for confirmation word.
 *   2. User types "УДАЛИТЬ" → soft-delete all transactions → success message.
 *   3. Any other text while pending → cancel.
 *
 * Returns a response string if the flow handled the message, null to pass through.
 */
export async function handleResetFlow(
  text: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  // ── Step 1: pending reset awaiting confirmation word ──────────────────────
  const pending = await getPendingReset(db, userId);

  if (pending) {
    if (text.trim() === CONFIRM_WORD) {
      await clearPendingReset(db, userId);
      const count = await softDeleteAllTransactions(db, userId);
      logger.info({ userId, count }, 'User reset all transaction history');
      return RESET_SUCCESS(count);
    }

    // Any other text cancels the reset
    await clearPendingReset(db, userId);
    return RESET_CANCELLED;
  }

  // ── Step 2: entry command ─────────────────────────────────────────────────
  if (matchResetCommand(text)) {
    await setPendingReset(db, userId);
    logger.info({ userId }, 'Reset confirmation prompt shown');
    return RESET_CONFIRM_PROMPT;
  }

  return null;
}
