import { describe, it, expect, vi } from 'vitest';
import {
  dispatchCallbackQuery,
} from '../../src/telegram/dispatch/dispatcher';
import { PASS, SENT } from '../../src/telegram/dispatch/types';
import type {
  CallbackHandler,
  CallbackDispatchContext,
} from '../../src/telegram/dispatch/callback-types';
import type { HandlerOutput } from '../../src/telegram/dispatch/types';

function makeCtx(data: string): CallbackDispatchContext {
  const logger = {
    info: () => undefined, warn: () => undefined, error: () => undefined,
    debug: () => undefined, fatal: () => undefined, trace: () => undefined,
    silent: () => undefined, level: 'info', child: () => logger,
  } as unknown as CallbackDispatchContext['logger'];
  return {
    data,
    chatId: 1,
    userId: 'u1',
    db: {} as CallbackDispatchContext['db'],
    env: {} as CallbackDispatchContext['env'],
    logger,
  };
}

function makeHandler(name: string, matchFn: (d: string) => boolean, output: HandlerOutput): CallbackHandler {
  return {
    name,
    match: vi.fn(matchFn),
    handle: vi.fn(async () => output),
  };
}

describe('dispatchCallbackQuery', () => {
  it('returns PASS when registry is empty', async () => {
    const r = await dispatchCallbackQuery(makeCtx('x'), []);
    expect(r.output.kind).toBe('pass');
    expect(r.handlerName).toBeNull();
  });

  it('returns PASS when no handler matches', async () => {
    const a = makeHandler('a', (d) => d === 'foo', SENT);
    const b = makeHandler('b', (d) => d === 'bar', SENT);
    const r = await dispatchCallbackQuery(makeCtx('quux'), [a, b]);
    expect(r.output.kind).toBe('pass');
    expect(a.handle).not.toHaveBeenCalled();
    expect(b.handle).not.toHaveBeenCalled();
  });

  it('skips non-matching handlers without invoking handle', async () => {
    const skip = makeHandler('skip', () => false, SENT);
    const hit = makeHandler('hit', () => true, SENT);
    await dispatchCallbackQuery(makeCtx('x'), [skip, hit]);
    expect(skip.handle).not.toHaveBeenCalled();
    expect(hit.handle).toHaveBeenCalledOnce();
  });

  it('returns the first matching handler output', async () => {
    const replyOutput: HandlerOutput = { kind: 'reply', text: 'hi' };
    const a = makeHandler('a', () => true, replyOutput);
    const b = makeHandler('b', () => true, SENT); // never reached
    const r = await dispatchCallbackQuery(makeCtx('x'), [a, b]);
    expect(r.output).toBe(replyOutput);
    expect(r.handlerName).toBe('a');
    expect(b.match).not.toHaveBeenCalled();
  });

  it('continues iteration if a matched handler returns PASS', async () => {
    // A handler that matches but defers (returns PASS) — must let the next try.
    const passer = makeHandler('passer', () => true, PASS);
    const taker = makeHandler('taker', () => true, SENT);
    const r = await dispatchCallbackQuery(makeCtx('x'), [passer, taker]);
    expect(r.handlerName).toBe('taker');
    expect(passer.handle).toHaveBeenCalledOnce();
    expect(taker.handle).toHaveBeenCalledOnce();
  });

  it('passes the data string to match()', async () => {
    const matchFn = vi.fn(() => false);
    const handler: CallbackHandler = { name: 'h', match: matchFn, handle: vi.fn() };
    await dispatchCallbackQuery(makeCtx('rec_time:9'), [handler]);
    expect(matchFn).toHaveBeenCalledWith('rec_time:9');
  });

  it('propagates handler exceptions', async () => {
    const handler: CallbackHandler = {
      name: 'thrower',
      match: () => true,
      handle: async () => { throw new Error('boom'); },
    };
    await expect(dispatchCallbackQuery(makeCtx('x'), [handler])).rejects.toThrow('boom');
  });
});
