/**
 * In-memory sliding-window limiter. Per serverless instance, so it is a
 * best-effort guard, not a hard ceiling — swap the store for Vercel KV /
 * Upstash before production (the call sites don't change).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

/**
 * The end-to-end suite signs up dozens of throwaway users from one IP in a few
 * minutes — well past any sane per-IP ceiling. Loosen (never disable) the guard
 * for those runs so the flows don't flake on a 429. Never set in production.
 */
const TEST_LIMIT_MULTIPLIER = process.env['AUTH_E2E'] === '1' ? 50 : 1;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  limit *= TEST_LIMIT_MULTIPLIER;
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}
