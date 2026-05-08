import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchWithRetry } from '../src/fetch-retry';

/**
 * Builds a mock Response. Vitest runs in Node, where global Response is
 * available since Node 18, so we can construct real Response instances.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchWithRetry', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('happy path', () => {
    it('returns the response on first success', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
      const res = await fetchWithRetry('https://example.test/x');
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('passes init body and headers through', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));
      await fetchWithRetry('https://example.test/x', {
        method: 'POST',
        headers: { 'X-Test': 'hello' },
        body: 'payload',
      });
      const call = fetchMock.mock.calls[0]!;
      expect(call[0]).toBe('https://example.test/x');
      expect(call[1]).toMatchObject({
        method: 'POST',
        headers: { 'X-Test': 'hello' },
        body: 'payload',
      });
    });

    it('attaches an AbortSignal to every attempt', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));
      await fetchWithRetry('https://example.test/x');
      const call = fetchMock.mock.calls[0]!;
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('does not retry on non-retriable status', () => {
    it('returns 4xx without retrying', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 400));
      const res = await fetchWithRetry('https://example.test/x');
      expect(res.status).toBe(400);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns 401/403/404 without retrying', async () => {
      for (const status of [401, 403, 404]) {
        fetchMock.mockReset();
        fetchMock.mockResolvedValueOnce(jsonResponse({}, status));
        const res = await fetchWithRetry('https://example.test/x');
        expect(res.status).toBe(status);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('retries on retriable status', () => {
    it('retries 500 and returns final success', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

      const promise = fetchWithRetry('https://example.test/x', {}, {
        retries: 2,
        baseDelayMs: 100,
      });
      await vi.advanceTimersByTimeAsync(150);
      const res = await promise;

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries 429 and 503', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, 429))
        .mockResolvedValueOnce(jsonResponse({}, 503))
        .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

      const promise = fetchWithRetry('https://example.test/x', {}, {
        retries: 3,
        baseDelayMs: 50,
      });
      await vi.advanceTimersByTimeAsync(500);
      const res = await promise;

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('returns the last response when retries are exhausted with a status error', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(jsonResponse({}, 500));

      const promise = fetchWithRetry('https://example.test/x', {}, {
        retries: 2,
        baseDelayMs: 50,
      });
      await vi.advanceTimersByTimeAsync(500);
      const res = await promise;

      expect(res.status).toBe(500);
      expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('retries on network errors', () => {
    it('retries on network error and returns final success', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const promise = fetchWithRetry('https://example.test/x', {}, {
        retries: 2,
        baseDelayMs: 50,
      });
      await vi.advanceTimersByTimeAsync(200);
      const res = await promise;

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws the last error when retries are exhausted', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(async () => {
        throw new TypeError('persistent failure');
      });

      // Capture the rejection by attaching .catch immediately — this also
      // marks the promise as handled, avoiding unhandledRejection noise.
      const captured: { err?: unknown } = {};
      const promise = fetchWithRetry('https://example.test/x', {}, {
        retries: 2,
        baseDelayMs: 50,
      });
      promise.catch((e) => { captured.err = e; });

      await vi.advanceTimersByTimeAsync(500);
      // Microtask flush so the .catch handler above has set captured.err
      await Promise.resolve();

      expect(captured.err).toBeInstanceOf(TypeError);
      expect((captured.err as Error).message).toBe('persistent failure');
      expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('back-off timing', () => {
    it('doubles the delay each attempt up to maxDelayMs', async () => {
      vi.useFakeTimers();
      const delaysObserved: number[] = [];
      fetchMock.mockImplementation(async () => {
        throw new TypeError('boom');
      });

      const promise = fetchWithRetry(
        'https://example.test/x',
        {},
        {
          retries: 3,
          baseDelayMs: 100,
          maxDelayMs: 250,
          onRetry: (info) => delaysObserved.push(info.delayMs),
        },
      );
      // Absorb the eventual rejection so it's not flagged as unhandled.
      promise.catch(() => undefined);

      // Drain all the timers
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();

      // Expected delays: 100 (attempt 0), 200 (attempt 1), min(400, 250)=250 (attempt 2)
      expect(delaysObserved).toEqual([100, 200, 250]);
    });
  });

  describe('onRetry callback', () => {
    it('fires for HTTP retries with status', async () => {
      vi.useFakeTimers();
      const events: Array<Record<string, unknown>> = [];
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, 503))
        .mockResolvedValueOnce(jsonResponse({}, 200));

      const promise = fetchWithRetry(
        'https://example.test/x',
        {},
        {
          retries: 2,
          baseDelayMs: 50,
          onRetry: (info) => events.push({ ...info }),
        },
      );
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ reason: 'http', status: 503, attempt: 0 });
    });

    it('fires for network retries with err', async () => {
      vi.useFakeTimers();
      const events: Array<Record<string, unknown>> = [];
      fetchMock
        .mockRejectedValueOnce(new TypeError('net'))
        .mockResolvedValueOnce(jsonResponse({}));

      const promise = fetchWithRetry(
        'https://example.test/x',
        {},
        {
          retries: 1,
          baseDelayMs: 50,
          onRetry: (info) => events.push({ ...info }),
        },
      );
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ reason: 'network', attempt: 0 });
      expect(events[0]?.err).toBeInstanceOf(TypeError);
    });
  });
});
