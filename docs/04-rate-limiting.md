# Rate Limiting

## Recommended Limits

| Endpoint | Key | Limit | Window | Purpose |
|----------|-----|-------|--------|---------|
| Send OTP | `otp:send:{phone}` | 3 | 10 min | Prevent SMS bombing a single number |
| Send OTP | `otp:send:ip:{ip}` | 10 | 10 min | Prevent distributed attacks from one source |
| Verify OTP | `otp:verify:ip:{ip}` | 10 | 10 min | Prevent brute force across multiple phones |
| Resend OTP | `otp:resend:{phone}` | 5 | 30 min | Stricter limit for resends |
| Register | `register:ip:{ip}` | 5 | 1 hour | Prevent mass account creation |
| Magic Link | `magic:{email}` | 5 | 15 min | Prevent email bombing |

## Multi-Tier Strategy

```
Request arrives
    │
    ├── Tier 1: Per-identity (phone/email)
    │   └── "3 codes per phone per 10 min"
    │
    ├── Tier 2: Per-IP
    │   └── "10 codes per IP per 10 min"
    │
    └── Tier 3: Per-OTP attempt counter (in DB)
        └── "5 wrong guesses per code"
```

## Backends

### Redis (Production)

Using Upstash Redis via REST API (works in serverless/edge):

```typescript
const result = await rateLimit(
  `otp:send:${phone}`,
  { limit: 3, windowSeconds: 600 },
  { authSensitive: true }
);

if (!result.success) {
  return NextResponse.json(
    { error: "Too many requests. Please wait." },
    { status: 429 }
  );
}
```

**Why Upstash?**
- REST-based (works in Vercel Edge, Cloudflare Workers)
- Pay-per-request pricing
- Global replication
- Native Vercel KV integration

### In-Memory (Development)

Automatic fallback when Redis is unavailable:

```typescript
// Development: in-memory Map with periodic cleanup
const memoryStore = new Map<string, { count: number; resetAt: number }>();
```

**Warning:** In-memory doesn't work across serverless instances. Each instance has its own counter.

## Fail-Closed vs Fail-Open

**CRITICAL DECISION for auth routes:**

```typescript
if (process.env.NODE_ENV === "production" && options?.authSensitive) {
  if (redis_unavailable) {
    // FAIL CLOSED: Deny the request
    return { success: false, remaining: 0, resetMs: 60_000 };
  }
}
```

| Strategy | Behavior | Use When |
|----------|----------|----------|
| **Fail-closed** | Deny requests when limiter is down | Auth-sensitive routes (OTP send/verify) |
| **Fail-open** | Allow requests when limiter is down | Non-critical routes (search, browsing) |

**Fail-closed prevents brute force attacks during Redis outages.** If an attacker takes down your Redis, they can't then brute-force OTPs unchecked.

## Response Headers

Include rate limit info in responses for well-behaved clients:

```typescript
return NextResponse.json({ success: true }, {
  headers: {
    "X-RateLimit-Limit": String(config.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetMs / 1000)),
    "Retry-After": result.success ? "" : String(Math.ceil(result.resetMs / 1000)),
  },
});
```
