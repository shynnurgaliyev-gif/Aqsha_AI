import {
  handleBillingPhoneInput,
} from '../../billing/billing-service';
import { sendMessage } from '../telegram-client';
import { handleBudgetCommand } from '../budgets/budget-handler';
import { matchExportCommand, EXPORT_PERIOD_KEYBOARD } from '../export/export-matcher';
import { handleGoalCommand } from '../goals/goal-handler';
import { handleCorrectionFlow } from '../transaction-correction/correction-handler';
import { handleRecurringCommand } from '../recurring/recurring-handler';
import { handleResetFlow } from '../reset/reset-handler';
import { handleAnalyticsQuery } from '../analytics/handler';
import { matchHelpCommand, HELP_MESSAGE, miniAppKeyboard } from '../help/help-formatter';
import { PASS, SENT, type HandlerOutput, type TextHandler } from './types';

// ── Generic command-error reply ─────────────────────────────────────────────
const COMMAND_ERROR_REPLY = 'Не удалось выполнить команду. Попробуйте позже.';

/**
 * Handles billing-phone digit input. The underlying helper sends its own
 * reply (it has its own keyboard logic), so we report `sent`.
 */
const billingPhoneHandler: TextHandler = {
  name: 'billing-phone',
  async tryHandle(ctx): Promise<HandlerOutput> {
    const response = await handleBillingPhoneInput(ctx.text, ctx.userId, ctx.db, ctx.env, ctx.logger);
    if (response === null) return PASS;
    await sendMessage(ctx.env.TELEGRAM_BOT_TOKEN, {
      chatId: ctx.chatId,
      text: response.text,
      ...(response.reply_markup ? { reply_markup: response.reply_markup } : {}),
    }, ctx.logger);
    return SENT;
  },
};

const exportHandler: TextHandler = {
  name: 'export',
  async tryHandle(ctx): Promise<HandlerOutput> {
    if (!matchExportCommand(ctx.text)) return PASS;
    return {
      kind: 'reply',
      text: '📂 За какой период выгрузить историю?',
      reply_markup: EXPORT_PERIOD_KEYBOARD,
    };
  },
};

const helpHandler: TextHandler = {
  name: 'help',
  async tryHandle(ctx): Promise<HandlerOutput> {
    if (!matchHelpCommand(ctx.text)) return PASS;
    if (ctx.env.TELEGRAM_MINIAPP_URL) {
      return {
        kind: 'reply',
        text: HELP_MESSAGE,
        reply_markup: miniAppKeyboard(ctx.env.TELEGRAM_MINIAPP_URL),
      };
    }
    return { kind: 'reply', text: HELP_MESSAGE };
  },
};

/**
 * Wraps a handler that returns `string | null` plus a try/catch. Used for
 * budget / goal commands — a thrown error becomes a generic apology reply.
 */
function stringHandler(
  name: string,
  fn: (ctx: import('./types').TextDispatchContext) => Promise<string | null>,
): TextHandler {
  return {
    name,
    async tryHandle(ctx): Promise<HandlerOutput> {
      let response: string | null;
      try {
        response = await fn(ctx);
      } catch (err) {
        ctx.logger.error({ err, userId: ctx.userId, handler: name }, 'Handler error');
        return { kind: 'reply', text: COMMAND_ERROR_REPLY };
      }
      return response === null ? PASS : { kind: 'reply', text: response };
    },
  };
}

const budgetHandler = stringHandler('budget', (ctx) =>
  handleBudgetCommand(ctx.text, ctx.userId, ctx.db, ctx.logger),
);

const goalHandler = stringHandler('goal', (ctx) =>
  handleGoalCommand(ctx.text, ctx.userId, ctx.db, ctx.logger),
);

/**
 * Recurring command — returns either a string OR an object with reply_markup.
 */
const recurringHandler: TextHandler = {
  name: 'recurring',
  async tryHandle(ctx): Promise<HandlerOutput> {
    let response: Awaited<ReturnType<typeof handleRecurringCommand>>;
    try {
      response = await handleRecurringCommand(ctx.text, ctx.userId, ctx.db, ctx.logger);
    } catch (err) {
      ctx.logger.error({ err, userId: ctx.userId, handler: 'recurring' }, 'Handler error');
      return { kind: 'reply', text: COMMAND_ERROR_REPLY };
    }
    if (response === null) return PASS;
    if (typeof response === 'string') return { kind: 'reply', text: response };
    return { kind: 'reply', text: response.message, reply_markup: response.reply_markup };
  },
};

const analyticsHandler: TextHandler = {
  name: 'analytics',
  async tryHandle(ctx): Promise<HandlerOutput> {
    const response = await handleAnalyticsQuery(ctx.text, ctx.userId, ctx.db, ctx.env, ctx.logger);
    return response === null ? PASS : { kind: 'reply', text: response };
  },
};

const resetHandler: TextHandler = {
  name: 'reset',
  async tryHandle(ctx): Promise<HandlerOutput> {
    const response = await handleResetFlow(ctx.text, ctx.userId, ctx.db, ctx.logger);
    return response === null ? PASS : { kind: 'reply', text: response };
  },
};

/**
 * Correction — same shape as recurring (string or {message, reply_markup}).
 */
const correctionHandler: TextHandler = {
  name: 'correction',
  async tryHandle(ctx): Promise<HandlerOutput> {
    const response = await handleCorrectionFlow(ctx.text, ctx.userId, ctx.db, ctx.logger);
    if (response === null) return PASS;
    if (typeof response === 'string') return { kind: 'reply', text: response };
    return { kind: 'reply', text: response.message, reply_markup: response.reply_markup };
  },
};

/**
 * Ordered registry of text handlers. Order matters — first match wins.
 * Adding a new feature usually means adding one entry here.
 *
 * The text-intake handler (transaction parsing + chat fallback) is NOT in
 * this list — it runs as the final fallback in update-router.ts because its
 * result-handling involves multi-message flows (budget alerts, etc.) that
 * don't fit the simple HandlerOutput shape.
 */
export const TEXT_HANDLERS: readonly TextHandler[] = [
  billingPhoneHandler,
  exportHandler,
  helpHandler,
  budgetHandler,
  goalHandler,
  recurringHandler,
  analyticsHandler,
  resetHandler,
  correctionHandler,
];
