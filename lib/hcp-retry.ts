export type HcpRetryDeps = {
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

const defaultDeps: HcpRetryDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 8_000,
};

let deps: HcpRetryDeps = { ...defaultDeps };

/** Tests replace sleep and random so retries do not wait on a real clock. */
export function setHcpRetryDepsForTests(next: Partial<HcpRetryDeps> | null) {
  deps = next ? { ...defaultDeps, ...next } : { ...defaultDeps };
}

export function shouldRetryHcpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Retry-After may be delta-seconds or an HTTP date. Null when it is missing or invalid. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  }
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return null;
}

/** Equal jitter: half the exponential delay, plus up to another half at random. */
export function backoffDelayMs(
  attempt: number,
  random: () => number = Math.random,
  base = defaultDeps.baseDelayMs,
  cap = defaultDeps.maxDelayMs,
): number {
  const exp = Math.min(cap, base * 2 ** attempt);
  const half = exp / 2;
  return Math.round(half + random() * half);
}

/**
 * Retry Housecall Pro calls on 429, 5xx, and network errors.
 * Retry-After wins over the backoff schedule. Other 4xx responses are returned as-is.
 */
export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < deps.maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      const retry = shouldRetryHcpStatus(response.status) && attempt < deps.maxAttempts - 1;
      if (!retry) return response;
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      const delay =
        retryAfter != null
          ? retryAfter
          : backoffDelayMs(attempt, deps.random, deps.baseDelayMs, deps.maxDelayMs);
      await response.body?.cancel().catch(() => undefined);
      await deps.sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt >= deps.maxAttempts - 1) throw error;
      await deps.sleep(backoffDelayMs(attempt, deps.random, deps.baseDelayMs, deps.maxDelayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Housecall Pro request failed");
}
