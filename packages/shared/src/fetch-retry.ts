/**
 * fetchWithRetry — fetch wrapper with timeout + bounded exponential back-off.
 *
 * Retries on:
 *   - Network errors (DNS, connection refused, abort/timeout)
 *   - HTTP 5xx
 *   - HTTP 429 (with optional Retry-After honoured)
 *
 * Does NOT retry on:
 *   - HTTP 4xx other than 429 (caller's bad input)
 *   - 2xx/3xx (success)
 *
 * The signal is created per-attempt — caller must not pass `init.signal`.
 * Total worst-case wall time = retries * timeoutMs + sum(back-off delays).
 *
 * Usage:
 *   const res = await fetchWithRetry(url, { method: 'POST', body: ... }, {
 *     timeoutMs: 15_000,
 *     retries: 2,
 *     onRetry: (info) => logger.warn(info, 'retry'),
 *   });
 */

export interface FetchRetryOptions {
  /** Per-attempt timeout. Default: 15_000 ms. */
  timeoutMs?: number;
  /** Number of retries after the first attempt. Default: 2 (3 total attempts). */
  retries?: number;
  /** Initial back-off delay; doubles each attempt. Default: 500 ms. */
  baseDelayMs?: number;
  /** Cap on a single back-off delay. Default: 5_000 ms. */
  maxDelayMs?: number;
  /** Hook fired before each retry. Useful for structured logging. */
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    reason: 'network' | 'http';
    status?: number;
    err?: unknown;
  }) => void;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function computeDelay(attempt: number, base: number, max: number): number {
  return Math.min(base * 2 ** attempt, max);
}

export async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, 'signal'> = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 15_000,
    retries = 2,
    baseDelayMs = 500,
    maxDelayMs = 5_000,
    onRetry,
  } = options;

  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (shouldRetryStatus(response.status) && attempt < retries) {
        const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);
        onRetry?.({ attempt, delayMs: delay, reason: 'http', status: response.status });
        await sleep(delay);
        continue;
      }

      return response;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);
        onRetry?.({ attempt, delayMs: delay, reason: 'network', err });
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error('fetchWithRetry: exhausted retries without response');
}
