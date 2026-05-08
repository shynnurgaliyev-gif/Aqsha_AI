import {
  handleBillingPayCallback,
  handleBillingConfirmPhone,
  handleBillingUsePhone,
  handleBillingChangePhone,
} from '../../billing/billing-service';
import { sendMessage, sendDocument } from '../telegram-client';
import {
  handleBulkDeleteCallback,
  handleDeleteCallback,
  handleCorrectionCallback,
} from '../transaction-correction/correction-handler';
import {
  handleRecurringTimeCallback,
  handleRecurringRecordCallback,
  handleRecurringDeleteCallback,
} from '../recurring/recurring-handler';
import { parseExportCallback } from '../export/export-matcher';
import { handleExportRequest } from '../export/export-handler';
import {
  getPendingDraft,
  clearPendingDraft,
  getPendingBulkDraft,
  clearPendingBulkDraft,
} from '../text-intake/session-draft';
import {
  insertConfirmedTransaction,
  insertConfirmedBulkTransactions,
} from '../text-intake/transaction-inserter';
import { getBudgetStatus } from '../budgets/budget-repository';
import { formatBudgetAlert } from '../budgets/budget-formatter';
import { PASS, SENT, type HandlerOutput } from './types';
import type { CallbackHandler, CallbackDispatchContext } from './callback-types';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Format an integer with non-breaking space thousands separator: 14500 → "14 500". */
function fmtAmount(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Posts a budget-over-limit alert if the user has a budget on `categoryId`
 * and they've now exceeded it. Errors are swallowed — alerts are cosmetic.
 */
async function maybeSendBudgetAlert(
  ctx: CallbackDispatchContext,
  categoryId: string,
): Promise<void> {
  try {
    const budgetStatus = await getBudgetStatus(ctx.db, ctx.userId, categoryId);
    if (budgetStatus && budgetStatus.remaining < 0) {
      await sendMessage(
        ctx.env.TELEGRAM_BOT_TOKEN,
        { chatId: ctx.chatId, text: formatBudgetAlert(budgetStatus) },
        ctx.logger,
      );
    }
  } catch (err) {
    ctx.logger.warn({ err }, 'Budget alert check failed — skipping');
  }
}

// ── Pre-gate billing callbacks ──────────────────────────────────────────────
// Accessible even when the user is in blocked/expired/canceled status, so
// they can still complete a payment.

const billingPay: CallbackHandler = {
  name: 'billing_pay',
  match: (d) => d === 'billing_pay',
  async handle(ctx) {
    const r = await handleBillingPayCallback(ctx.userId, ctx.db, ctx.env, ctx.logger);
    return { kind: 'reply', text: r.text, ...(r.reply_markup ? { reply_markup: r.reply_markup } : {}) };
  },
};

const billingConfirmPhone: CallbackHandler = {
  name: 'billing_confirm_phone',
  match: (d) => d === 'billing_confirm_phone',
  async handle(ctx) {
    const r = await handleBillingConfirmPhone(ctx.userId, ctx.db, ctx.env, ctx.logger);
    return { kind: 'reply', text: r.text, ...(r.reply_markup ? { reply_markup: r.reply_markup } : {}) };
  },
};

const billingUsePhone: CallbackHandler = {
  name: 'billing_use_phone',
  match: (d) => d === 'billing_use_phone',
  async handle(ctx) {
    const r = await handleBillingUsePhone(ctx.userId, ctx.db, ctx.env, ctx.logger);
    return { kind: 'reply', text: r.text, ...(r.reply_markup ? { reply_markup: r.reply_markup } : {}) };
  },
};

const billingChangePhone: CallbackHandler = {
  name: 'billing_change_phone',
  match: (d) => d === 'billing_change_phone',
  async handle(ctx) {
    const r = await handleBillingChangePhone(ctx.userId, ctx.db, ctx.logger);
    return { kind: 'reply', text: r.text };
  },
};

export const PRE_GATE_CALLBACK_HANDLERS: readonly CallbackHandler[] = [
  billingPay,
  billingConfirmPhone,
  billingUsePhone,
  billingChangePhone,
];

// ── Post-gate callbacks (only for users that pass checkSubscriptionAccess) ──

/**
 * confirm/cancel for transaction drafts. Bulk drafts take priority over
 * single drafts — same precedence as text-intake. Returns SENT because the
 * handler manages multi-message side effects (budget alerts loop).
 */
const confirmCancelDraft: CallbackHandler = {
  name: 'confirm_or_cancel_draft',
  match: (d) => d === 'confirm' || d === 'cancel',
  async handle(ctx): Promise<HandlerOutput> {
    const isConfirm = ctx.data === 'confirm';

    // Bulk draft takes priority
    const bulkDraft = await getPendingBulkDraft(ctx.db, ctx.userId);
    if (bulkDraft) {
      if (isConfirm) {
        await insertConfirmedBulkTransactions(ctx.db, ctx.userId, bulkDraft.items);
        await clearPendingBulkDraft(ctx.db, ctx.userId);
        ctx.logger.info({ userId: ctx.userId, count: bulkDraft.items.length }, 'Bulk transactions confirmed via inline button');
        const total = bulkDraft.items.reduce((sum, i) => sum + i.amount, 0);
        await sendMessage(
          ctx.env.TELEGRAM_BOT_TOKEN,
          { chatId: ctx.chatId, text: `✅ Записано ${bulkDraft.items.length} операций на ${fmtAmount(total)} ₸` },
          ctx.logger,
        );
        for (const item of bulkDraft.items) {
          if (item.kind === 'expense') await maybeSendBudgetAlert(ctx, item.categoryId);
        }
      } else {
        await clearPendingBulkDraft(ctx.db, ctx.userId);
        ctx.logger.info({ userId: ctx.userId }, 'Bulk draft cancelled via inline button');
        await sendMessage(ctx.env.TELEGRAM_BOT_TOKEN, { chatId: ctx.chatId, text: '❌ Отменено.' }, ctx.logger);
      }
      return SENT;
    }

    // Single draft
    const draft = await getPendingDraft(ctx.db, ctx.userId);
    if (!draft) {
      return { kind: 'reply', text: '⏱ Время подтверждения истекло. Отправь транзакцию заново.' };
    }

    if (isConfirm) {
      await insertConfirmedTransaction(ctx.db, ctx.userId, draft);
      await clearPendingDraft(ctx.db, ctx.userId);
      ctx.logger.info({ userId: ctx.userId, amount: draft.amount }, 'Transaction confirmed via inline button');
      const savedEmoji = draft.kind === 'expense' ? '📤' : '📥';
      const savedLabel = draft.kind === 'expense' ? 'Расход записан' : 'Доход записан';
      await sendMessage(
        ctx.env.TELEGRAM_BOT_TOKEN,
        {
          chatId: ctx.chatId,
          text: `${savedEmoji} ${savedLabel}!\n💵 Сумма: ${fmtAmount(draft.amount)} ₸\n📁 Категория: ${draft.categoryName}`,
        },
        ctx.logger,
      );
      if (draft.kind === 'expense') await maybeSendBudgetAlert(ctx, draft.categoryId);
    } else {
      await clearPendingDraft(ctx.db, ctx.userId);
      ctx.logger.info({ userId: ctx.userId }, 'Transaction cancelled via inline button');
      await sendMessage(ctx.env.TELEGRAM_BOT_TOKEN, { chatId: ctx.chatId, text: '❌ Отменено.' }, ctx.logger);
    }
    return SENT;
  },
};

const deleteConfirm: CallbackHandler = {
  name: 'delete_confirm',
  match: (d) => d === 'del_yes' || d === 'del_no',
  async handle(ctx) {
    const action = ctx.data === 'del_yes' ? 'yes' : 'no';
    const text = await handleDeleteCallback(action, ctx.userId, ctx.db, ctx.logger);
    return { kind: 'reply', text };
  },
};

const correctionConfirm: CallbackHandler = {
  name: 'correction_confirm',
  match: (d) => d === 'corr_yes' || d === 'corr_no',
  async handle(ctx) {
    const action = ctx.data === 'corr_yes' ? 'yes' : 'no';
    const text = await handleCorrectionCallback(action, ctx.userId, ctx.db, ctx.logger);
    return { kind: 'reply', text };
  },
};

const bulkDeleteConfirm: CallbackHandler = {
  name: 'bulk_delete_confirm',
  match: (d) => d === 'bulk_yes' || d === 'bulk_no',
  async handle(ctx) {
    const action = ctx.data === 'bulk_yes' ? 'yes' : 'no';
    const text = await handleBulkDeleteCallback(action, ctx.userId, ctx.db, ctx.logger);
    return { kind: 'reply', text };
  },
};

const REC_TIME_PREFIX = 'rec_time:';
const recurringTime: CallbackHandler = {
  name: 'recurring_time',
  match: (d) => d.startsWith(REC_TIME_PREFIX),
  async handle(ctx) {
    const hour = parseInt(ctx.data.slice(REC_TIME_PREFIX.length), 10);
    const text = await handleRecurringTimeCallback(hour, ctx.userId, ctx.db, ctx.logger);
    return { kind: 'reply', text };
  },
};

const REC_RECORD_PREFIX = 'rec_record:';
const recurringRecord: CallbackHandler = {
  name: 'recurring_record',
  match: (d) => d.startsWith(REC_RECORD_PREFIX),
  async handle(ctx) {
    const recurringId = ctx.data.slice(REC_RECORD_PREFIX.length);
    const text = await handleRecurringRecordCallback(recurringId, ctx.userId, ctx.db, ctx.logger);
    return { kind: 'reply', text };
  },
};

const REC_SKIP_PREFIX = 'rec_skip:';
const recurringSkip: CallbackHandler = {
  name: 'recurring_skip',
  match: (d) => d.startsWith(REC_SKIP_PREFIX),
  async handle() {
    return { kind: 'reply', text: '✓ Пропущено.' };
  },
};

const REC_DEL_PREFIX = 'rec_del:';
const recurringDelete: CallbackHandler = {
  name: 'recurring_delete',
  match: (d) => d.startsWith(REC_DEL_PREFIX),
  async handle(ctx) {
    const recurringId = ctx.data.slice(REC_DEL_PREFIX.length);
    const text = await handleRecurringDeleteCallback(recurringId, ctx.userId, ctx.db, ctx.logger);
    return { kind: 'reply', text };
  },
};

const exportPeriod: CallbackHandler = {
  name: 'export_period',
  match: (d) => parseExportCallback(d) !== null,
  async handle(ctx): Promise<HandlerOutput> {
    const period = parseExportCallback(ctx.data);
    if (period === null) return PASS; // defensive — should never happen
    const exportResult = await handleExportRequest(ctx.userId, period, ctx.db, ctx.logger);
    if (!exportResult) {
      return { kind: 'reply', text: '📭 Нет данных за выбранный период.' };
    }
    await sendDocument(
      ctx.env.TELEGRAM_BOT_TOKEN,
      {
        chatId: ctx.chatId,
        fileBuffer: exportResult.buffer,
        filename: exportResult.filename,
        caption: exportResult.caption,
      },
      ctx.logger,
    );
    return SENT;
  },
};

export const POST_GATE_CALLBACK_HANDLERS: readonly CallbackHandler[] = [
  confirmCancelDraft,
  deleteConfirm,
  correctionConfirm,
  bulkDeleteConfirm,
  recurringTime,
  recurringRecord,
  recurringSkip,
  recurringDelete,
  exportPeriod,
];
