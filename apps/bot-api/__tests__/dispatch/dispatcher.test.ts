import { describe, it, expect, vi } from 'vitest';
import { dispatchTextMessage } from '../../src/telegram/dispatch/dispatcher';
import { PASS, SENT, type HandlerOutput, type TextHandler, type TextDispatchContext } from '../../src/telegram/dispatch/types';

/**
 * Builds a stub context. The dispatcher itself only reads ctx — handlers may
 * use any of its fields, but our test handlers ignore everything.
 */
function makeCtx(overrides: Partial<TextDispatchContext> = {}): TextDispatchContext {
  const logger = {
    info: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    fatal: () => undefined,
    trace: () => undefined,
    silent: () => undefined,
    level: 'info',
    child: () => logger,
  } as unknown as TextDispatchContext['logger'];

  return {
    text: 'whatever',
    msg: { message_id: 1, chat: { id: 1, type: 'private' }, date: 0 } as TextDispatchContext['msg'],
    chatId: 1,
    userId: 'u1',
    db: {} as TextDispatchContext['db'],
    env: {} as TextDispatchContext['env'],
    logger,
    ...overrides,
  };
}

function makeHandler(name: string, output: HandlerOutput): TextHandler {
  return {
    name,
    tryHandle: vi.fn(async () => output),
  };
}

describe('dispatchTextMessage', () => {
  it('returns PASS with null name when no handlers exist', async () => {
    const result = await dispatchTextMessage(makeCtx(), []);
    expect(result.output.kind).toBe('pass');
    expect(result.handlerName).toBeNull();
  });

  it('returns PASS when every handler passes', async () => {
    const result = await dispatchTextMessage(makeCtx(), [
      makeHandler('a', PASS),
      makeHandler('b', PASS),
    ]);
    expect(result.output.kind).toBe('pass');
    expect(result.handlerName).toBeNull();
  });

  it('returns first non-pass handler output and stops iteration', async () => {
    const a = makeHandler('a', PASS);
    const b = makeHandler('b', SENT);
    const c = makeHandler('c', SENT); // should not run
    const result = await dispatchTextMessage(makeCtx(), [a, b, c]);

    expect(result.output.kind).toBe('sent');
    expect(result.handlerName).toBe('b');
    expect(a.tryHandle).toHaveBeenCalledOnce();
    expect(b.tryHandle).toHaveBeenCalledOnce();
    expect(c.tryHandle).not.toHaveBeenCalled();
  });

  it('returns reply output verbatim', async () => {
    const replyOutput: HandlerOutput = { kind: 'reply', text: 'hello', reply_markup: { inline_keyboard: [[]] } };
    const result = await dispatchTextMessage(makeCtx(), [
      makeHandler('a', PASS),
      makeHandler('reply', replyOutput),
    ]);
    expect(result.output).toEqual(replyOutput);
    expect(result.handlerName).toBe('reply');
  });

  it('passes the same context to each handler in order', async () => {
    const order: string[] = [];
    const ctx = makeCtx({ text: 'unique-marker' });
    const make = (name: string): TextHandler => ({
      name,
      tryHandle: async (received) => {
        expect(received).toBe(ctx); // same reference
        order.push(name);
        return PASS;
      },
    });
    await dispatchTextMessage(ctx, [make('first'), make('second'), make('third')]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('propagates exceptions from handlers (caller is responsible for try/catch)', async () => {
    const handler: TextHandler = {
      name: 'thrower',
      tryHandle: async () => { throw new Error('handler crashed'); },
    };
    await expect(dispatchTextMessage(makeCtx(), [handler])).rejects.toThrow('handler crashed');
  });
});
