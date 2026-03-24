import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import { matchCorrectionCommand } from './correction-command-matcher';
import { matchAmountCorrection } from './correction-amount-matcher';
import { matchCategoryCorrection } from './correction-category-matcher';
import {
  findLastTransaction,
  softDeleteTransaction,
  queryRecentForCorrection,
  updateTransactionAmount,
  updateTransactionCategory,
} from './correction-repository';
import { getPendingDelete, setPendingDelete, clearPendingDelete } from './correction-session';
import {
  getPendingCorrection,
  setPendingCorrection,
  clearPendingCorrection,
} from './correction-edit-session';
import { resolveCategory } from '../text-intake/category-resolver';
import {
  formatRecentForCorrection,
  formatDeletePrompt,
  formatDeleteSuccess,
  formatCorrectionAmountPrompt,
  formatCorrectionCategoryPrompt,
  formatCorrectionSuccess,
  DELETE_CANCELLED,
  DELETE_AWAITING,
  DELETE_NOT_FOUND,
  DELETE_FAILED,
  CORRECTION_AWAITING,
  CORRECTION_CANCELLED,
  CORRECTION_NO_TRANSACTION,
  CORRECTION_FAILED,
  CORRECTION_CATEGORY_NOT_FOUND,
} from './correction-formatter';

const CONFIRMATION_TOKENS = new Set(['да', 'yes', 'подтвердить', 'confirm', 'ok', 'ок', '+']);
const CANCELLATION_TOKENS = new Set(['нет', 'no', 'отмена', 'cancel', 'отменить', '-']);

/**
 * Handles transaction correction commands, pending delete confirmation,
 * and pending correction (amount / category) confirmation.
 *
 * Returns a response string if the message was handled, or null to pass
 * through to the text intake handler.
 *
 * Priority:
 *   1. If 'pendingCorrection' is present in session context:
 *        - confirmation token → apply correction, clear state, success message
 *        - cancellation token → clear state, cancel message
 *        - anything else      → remind user to confirm or cancel (state held)
 *   2. If 'pendingDelete' is present in session context:
 *        - confirmation token → soft-delete, clear state, success/fail message
 *        - cancellation token → clear state, cancel message
 *        - anything else      → remind user to confirm or cancel (state held)
 *   3. If a correction command is matched:
 *        - 'show_recent'  → query and format recent transactions
 *        - 'delete_last'  → find last transaction, set pending delete, return prompt
 *   4. If an amount-correction command is matched:
 *        - find last confirmed transaction, set pending correction, return prompt
 *   5. If a category-correction command is matched:
 *        - find last confirmed transaction, resolve category, set pending correction, return prompt
 *   6. Otherwise: return null (fall through to text intake).
 *
 * Mutual exclusion:
 *   - setPendingCorrection removes pendingTransaction + pendingDelete
 *   - setPendingDelete removes pendingTransaction + pendingCorrection
 */
export async function handleCorrectionFlow(
  text: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const normalized = text.toLowerCase().trim();

  // ── 1. Pending correction confirmation ──────────────────────────────────────
  const pendingCorrection = await getPendingCorrection(db, userId);

  if (pendingCorrection) {
    if (CONFIRMATION_TOKENS.has(normalized)) {
      let updated = false;

      if (pendingCorrection.field === 'amount' && pendingCorrection.newAmount !== undefined) {
        updated = await updateTransactionAmount(
          db,
          pendingCorrection.transactionId,
          userId,
          pendingCorrection.newAmount,
        );
      } else if (pendingCorrection.field === 'category' && pendingCorrection.newCategoryId !== undefined) {
        updated = await updateTransactionCategory(
          db,
          pendingCorrection.transactionId,
          userId,
          pendingCorrection.newCategoryId,
        );
      }

      await clearPendingCorrection(db, userId);

      if (updated) {
        logger.info(
          { userId, transactionId: pendingCorrection.transactionId, field: pendingCorrection.field },
          'Transaction corrected',
        );
        return formatCorrectionSuccess(pendingCorrection);
      } else {
        logger.warn(
          { userId, transactionId: pendingCorrection.transactionId },
          'Correction UPDATE matched no row — already modified or concurrent change',
        );
        return CORRECTION_FAILED;
      }
    }

    if (CANCELLATION_TOKENS.has(normalized)) {
      await clearPendingCorrection(db, userId);
      logger.info({ userId }, 'Correction cancelled by user');
      return CORRECTION_CANCELLED;
    }

    // Any other text while a correction is pending: hold the state and remind.
    return CORRECTION_AWAITING;
  }

  // ── 2. Pending delete confirmation ──────────────────────────────────────────
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

  // ── 3. Correction commands ───────────────────────────────────────────────────
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

  // ── 4. Amount correction command ─────────────────────────────────────────────
  const newAmount = matchAmountCorrection(normalized);

  if (newAmount !== null) {
    const last = await findLastTransaction(db, userId);

    if (!last) {
      return CORRECTION_NO_TRANSACTION;
    }

    await setPendingCorrection(db, userId, {
      transactionId: last.id,
      kind: last.kind,
      currentAmount: last.amount,
      currentCategoryName: last.categoryName,
      transactionDateLocal: last.transactionDateLocal,
      field: 'amount',
      newAmount,
    });

    logger.info({ userId, transactionId: last.id, newAmount }, 'Pending amount correction set');
    return formatCorrectionAmountPrompt(last, newAmount);
  }

  // ── 5. Category correction command ───────────────────────────────────────────
  const categoryCandidate = matchCategoryCorrection(normalized);

  if (categoryCandidate !== null) {
    const last = await findLastTransaction(db, userId);

    if (!last) {
      return CORRECTION_NO_TRANSACTION;
    }

    const resolved = await resolveCategory(db, userId, last.kind, categoryCandidate);

    if (!resolved) {
      logger.info({ userId, categoryCandidate, kind: last.kind }, 'Category not found for correction');
      return CORRECTION_CATEGORY_NOT_FOUND;
    }

    await setPendingCorrection(db, userId, {
      transactionId: last.id,
      kind: last.kind,
      currentAmount: last.amount,
      currentCategoryName: last.categoryName,
      transactionDateLocal: last.transactionDateLocal,
      field: 'category',
      newCategoryId: resolved.id,
      newCategoryName: resolved.name,
    });

    logger.info({ userId, transactionId: last.id, newCategoryId: resolved.id }, 'Pending category correction set');
    return formatCorrectionCategoryPrompt(last, resolved.name);
  }

  return null;
}
