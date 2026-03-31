/**
 * Multi-Tier Rate Limiting
 *
 * Production OTP systems need layered rate limits:
 * 1. Per-phone: prevents abuse of a single number
 * 2. Per-IP: prevents distributed attacks
 * 3. Global: circuit breaker for runaway costs
 *
 * Backends: Redis (production) → In-memory (development)
 * CRITICAL: Auth-sensitive routes FAIL CLOSED in production
 * when Redis is unavailable — denies requests rather than allowing unlimited.
 */

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Remaining requests in the window */
  remaining: number;
  /** Milliseconds until the window resets */
  resetMs: number;
}

interface RateLimitOptions {
  /**
   * If true, FAIL CLOSED when Redis is unavailable in production.
   * Use for auth routes (OTP send/verify). This prevents brute force
   * attacks from succeeding when your rate limiter is down.
   */
  authSensitive?: boolean;
}

// ── Redis backend (Upstash / Vercel KV) ─────────────────────────

let redisAvailable: boolean | null = null;

async function redisRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult | null> {
  const restUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!restUrl || !restToken) {
    redisAvailable = false;
    return null;
  }

  try {
    // Sliding window using sorted sets
    const now = Date.now();
    const windowStart = now - config.windowSeconds * 1000;
    const member = `${now}:${Math.random().toString(36).slice(2)}`;

    // Pipeline: remove expired → count → add → set TTL
    const pipeline = [
      ["ZREMRANGEBYSCORE", key, "0", String(windowStart)],
      ["ZCARD", key],
      ["ZADD", key, String(now), member],
      ["PEXPIRE", key, String(config.windowSeconds * 1000)],
    ];

    const res = await fetch(`${restUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });

    if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);

    const results = await res.json();
    const currentCount = results[1]?.result ?? 0;

    redisAvailable = true;

    // NOTE: This pipeline adds the member before checking the count,
    // which means the ZCARD reflects the state AFTER insertion.
    // The +1 accounts for the member we just added.
    const countAfterAdd = (results[1]?.result ?? 0) + 1;

    if (countAfterAdd > config.limit) {
      // Over limit — remove the member we speculatively added
      await fetch(`${restUrl}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["ZREM", key, member]),
      }).catch(() => {}); // Best-effort cleanup

      return {
        success: false,
        remaining: 0,
        resetMs: config.windowSeconds * 1000,
      };
    }

    return {
      success: true,
      remaining: config.limit - countAfterAdd,
      resetMs: config.windowSeconds * 1000,
    };
  } catch (err) {
    console.error("[RATE-LIMIT] Redis error:", err);
    redisAvailable = false;
    return null;
  }
}

// ── In-memory fallback (development / single-instance) ──────────

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, {
      count: 1,
      resetAt: now + config.windowSeconds * 1000,
    });
    return { success: true, remaining: config.limit - 1, resetMs: config.windowSeconds * 1000 };
  }

  entry.count++;

  if (entry.count > config.limit) {
    return { success: false, remaining: 0, resetMs: entry.resetAt - now };
  }

  return {
    success: true,
    remaining: config.limit - entry.count,
    resetMs: entry.resetAt - now,
  };
}

// Periodic cleanup of expired in-memory entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetAt) memoryStore.delete(key);
  }
}, 60_000);

// ── Public API ──────────────────────────────────────────────────

/**
 * Rate limit a request by key.
 *
 * Recommended limits for OTP:
 * ┌──────────────────────┬───────┬────────┐
 * │ Route                │ Limit │ Window │
 * ├──────────────────────┼───────┼────────┤
 * │ Send OTP (per phone) │ 3     │ 10 min │
 * │ Send OTP (per IP)    │ 10    │ 10 min │
 * │ Verify OTP (per IP)  │ 10    │ 10 min │
 * │ Resend OTP (per ph)  │ 5     │ 30 min │
 * │ Register (per IP)    │ 5     │ 1 hour │
 * └──────────────────────┴───────┴────────┘
 */
export async function rateLimit(
  key: string,
  config: RateLimitConfig,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  // Try Redis first
  const redisResult = await redisRateLimit(key, config);
  if (redisResult) return redisResult;

  // Redis unavailable — decide based on environment
  if (process.env.NODE_ENV === "production" && options?.authSensitive) {
    // FAIL CLOSED: deny auth requests when rate limiter is down
    // This prevents brute force attacks during Redis outages
    console.error(`[RATE-LIMIT] Redis unavailable — denying auth request for key: ${key}`);
    return { success: false, remaining: 0, resetMs: 60_000 };
  }

  // Development or non-auth routes: fall back to in-memory
  return memoryRateLimit(key, config);
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Extract client IP from request headers.
 *
 * IMPORTANT: x-forwarded-for and x-real-ip are only trustworthy if your
 * reverse proxy (Vercel, Cloudflare, nginx) overwrites them. On bare
 * servers without a trusted proxy, clients can spoof these headers to
 * bypass IP-based rate limits. Use cf-connecting-ip (Cloudflare) or
 * Vercel's built-in IP when available — these are set by the platform.
 */
export function getClientIp(headers: Headers): string {
  return (
    // Cloudflare (set by platform, not spoofable)
    headers.get("cf-connecting-ip") ||
    // Vercel / standard proxy
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    // Nginx
    headers.get("x-real-ip") ||
    "unknown"
  );
}
