/**
 * In-memory sliding-window rate limiter for Next.js API routes.
 *
 * Suitable for single-instance deployments (this club). For
 * multi-instance, swap the Map for Redis.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });
 *   // in a route handler:
 *   const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
 *   if (!limiter.check(ip)) {
 *     return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 *   }
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterOptions {
  /** Window duration in milliseconds (default: 5 minutes) */
  windowMs?: number;
  /** Max requests per window per key (default: 10) */
  max?: number;
  /** How often to purge expired entries in ms (default: 60s) */
  cleanupIntervalMs?: number;
}

export function createRateLimiter(opts: RateLimiterOptions = {}) {
  const windowMs = opts.windowMs ?? 5 * 60_000;
  const max = opts.max ?? 10;
  const cleanupIntervalMs = opts.cleanupIntervalMs ?? 60_000;

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries to prevent memory leaks
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, cleanupIntervalMs);

  // Allow GC if the module is unloaded
  if (cleanup.unref) cleanup.unref();

  return {
    /**
     * Check whether a request from `key` is allowed.
     * Returns true if under the limit, false if rate-limited.
     * Automatically records the request if allowed.
     */
    check(key: string): boolean {
      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Remove expired timestamps
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

      if (entry.timestamps.length >= max) {
        return false;
      }

      entry.timestamps.push(now);
      return true;
    },

    /** Number of remaining requests for a key */
    remaining(key: string): number {
      const cutoff = Date.now() - windowMs;
      const entry = store.get(key);
      if (!entry) return max;
      const active = entry.timestamps.filter((t) => t > cutoff).length;
      return Math.max(0, max - active);
    },
  };
}

/** Extract client IP from a request (respects x-forwarded-for from Cloudflare) */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
