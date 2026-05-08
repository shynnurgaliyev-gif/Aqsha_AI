import { sendMessage } from '../telegram-client';
import { PASS, type HandlerOutput, type TextDispatchContext, type TextHandler } from './types';
import type { CallbackDispatchContext, CallbackHandler } from './callback-types';

/**
 * Walks the handler registry in order, returning as soon as one returns
 * non-pass. The dispatcher does NOT send replies — that responsibility lives
 * with the caller (see `runTextHandlers`) so post-handler side effects (like
 * budget alerts) can run before sending.
 *
 * Pure function (modulo handler side effects), trivially testable with mock
 * handlers — see __tests__/dispatch/dispatcher.test.ts.
 */
export async function dispatchTextMessage(
  ctx: TextDispatchContext,
  handlers: readonly TextHandler[],
): Promise<{ output: HandlerOutput; handlerName: string | null }> {
  for (const handler of handlers) {
    const output = await handler.tryHandle(ctx);
    if (output.kind !== 'pass') {
      return { output, handlerName: handler.name };
    }
  }
  return { output: PASS, handlerName: null };
}

/**
 * Runs the registry and applies the result:
 *   - `sent`  — handler already replied; nothing else to do.
 *   - `reply` — send the produced text (and optional keyboard).
 *   - `pass`  — return false so the caller can run its own fallback.
 */
export async function runTextHandlers(
  ctx: TextDispatchContext,
  handlers: readonly TextHandler[],
): Promise<boolean> {
  const { output, handlerName } = await dispatchTextMessage(ctx, handlers);

  if (output.kind === 'pass') return false;

  if (handlerName) {
    ctx.logger.info({ userId: ctx.userId, handler: handlerName }, 'Text handler dispatched');
  }

  if (output.kind === 'sent') return true;

  // output.kind === 'reply'
  await sendMessage(
    ctx.env.TELEGRAM_BOT_TOKEN,
    {
      chatId: ctx.chatId,
      text: output.text,
      ...(output.reply_markup ? { reply_markup: output.reply_markup } : {}),
    },
    ctx.logger,
  );
  return true;
}

// ── Callback registry walk ──────────────────────────────────────────────────

/**
 * Walks a callback-handler registry, returning the first match's output.
 * Pure function — does not send replies. Returns `{ output: PASS, ... }`
 * when no handler matched.
 */
export async function dispatchCallbackQuery(
  ctx: CallbackDispatchContext,
  handlers: readonly CallbackHandler[],
): Promise<{ output: HandlerOutput; handlerName: string | null }> {
  for (const handler of handlers) {
    if (!handler.match(ctx.data)) continue;
    const output = await handler.handle(ctx);
    if (output.kind !== 'pass') {
      return { output, handlerName: handler.name };
    }
  }
  return { output: PASS, handlerName: null };
}

/**
 * Same as runTextHandlers but for callback handlers. Returns true if any
 * handler claimed the callback.
 */
export async function runCallbackHandlers(
  ctx: CallbackDispatchContext,
  handlers: readonly CallbackHandler[],
): Promise<boolean> {
  const { output, handlerName } = await dispatchCallbackQuery(ctx, handlers);

  if (output.kind === 'pass') return false;

  if (handlerName) {
    ctx.logger.info({ userId: ctx.userId, handler: handlerName }, 'Callback handler dispatched');
  }

  if (output.kind === 'sent') return true;

  // output.kind === 'reply'
  await sendMessage(
    ctx.env.TELEGRAM_BOT_TOKEN,
    {
      chatId: ctx.chatId,
      text: output.text,
      ...(output.reply_markup ? { reply_markup: output.reply_markup } : {}),
    },
    ctx.logger,
  );
  return true;
}
