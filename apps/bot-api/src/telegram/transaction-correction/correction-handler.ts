import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import { matchCorrectionCommand } from './correction-command-matcher';
import {
  findLastTransaction,
  softDeleteTransaction,
  queryRecentForCorrection,
} from './correction-repository';
import { getPendingDelete, setPendingDelete, clearPendingDelete } from './correction-session';
import {
  formatRecentForCorrection,
  formatDeletePrompt,
  formatDeleteSuccess,
  DELETE_CANCELLED,
  DELETE_AWAITING,
  DELETE_NOT_FOUND,
  DELETE_FAILED,
} from './correction-formatter';

const CONFIRMATION_TOKENS = new Set(['да', 'yes', 'подтвердить', 'confirm', 'ok', 'ок', '+']);
const CANCELLATION_TOKENS = new Set(['нет', 'no', 'отмена', 'cancel', 'отменить', '-']);

/**
 * Handles transaction correction commands and pending delete confirmation.
 *
 * Returns a response string if the message was handled, or null to pass
 * through to the text intake handler.
 *
 * Priority:
 *   1. If 'pendingDelete' is present in session context:
 *        - confirmation token → soft-delete, clear state, success message
 *        - cancellation token → clear state, cancel message
 *        - anything else      → remind user to confirm or cancel (state held)
 *   2. If a correction command is matched:
 *        - 'show_recent'  → query and format recent transactions
 *        - 'delete_last'  → find last transaction, set pending delete, return prompt
 *   3. Otherwise: return null (fall through to text intake).
 *
 * The 'delete_last' path removes any existing 'pendingTransaction' draft from
 * the session to prevent confirmation ambiguity between the two flows.
 */
export async function handleCorrectionFlow(
  text: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const normalized = text.toLowerCase().trim();

  // ── 1. Pending delete confirmation ──────────────────────────────────────────
  const pendingDelete = await getPendingDelete(db, userId);

  if (pendingDelete) {
    if (CONFIRMATION_TOKENS.has(normalized)) {
      const deleted = await softDeleteTransaction(db, pendingDelete.transactionId, userId);
      await clearPendingDelete(db, userId);

      if (deleted) {
        logger.info({ userId, transactionId: pendingDelete.transactionId }, 'Transaction soft-deleted');
        return formatDeleteSuccess(pendingDelete);
      } else {
        logger.warn({ userId, transactionId: pendingDelete.transactionId }, 'Soft-delete matched no row — already deleted or concurrent change');
        return DELETE_FAILED;
      }
    }

    if (CANCELLATION_TOKENS.has(normalized)) {
      await clearPendingDelete(db, userId);
      logger.info({ userId }, 'Delete cancelled by user');
      return DELETE_CANCELLED;
    }

    // Any other text while a delete is pending: hold the state and remind.
    return DELETE_AWAITING;
  }

  // ── 2. Correction commands ───────────────────────────────────────────────────
  const commandType = matchCorrectionCommand(normalized);

  if (commandType === 'show_recent') {
    const rows = await queryRecentForCorrection(db, userId);
    logger.info({ userId, count: rows.length }, 'Recent transactions listed for correction');
    return formatRecentForCorrection(rows);
  }

  if (commandType === 'delete_last') {
    const last = await findLastTransaction(db, userId);

    if (!last) {
      return DELETE_NOT_FOUND;
    }

    await setPendingDelete(db, userId, {
      transactionId: last.id,
      kind: last.kind,
      amount: last.amount,
      categoryName: last.categoryName,
      transactionDateLocal: last.transactionDateLocal,
    });

    logger.info({ userId, transactionId: last.id }, 'Pending delete set');
    return formatDeletePrompt(last);
  }

  return null;
}
