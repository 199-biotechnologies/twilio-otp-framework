# Session Management

## After OTP Verification

Once a user verifies their OTP, you need to establish a persistent session.

## Database-Backed Sessions

Recommended for most applications.

```typescript
// Create session after successful OTP
const sessionId = crypto.randomBytes(32).toString("hex");
const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

await sql`INSERT INTO sessions (id, user_id, expires_at, ip, created_at)
          VALUES (${sessionId}, ${userId}, ${expiresAt}, ${ip}, NOW())`;

// Set HTTP-only cookie
cookies().set("__session", sessionId, {
  httpOnly: true,     // XSS can't read it
  secure: true,       // HTTPS only
  sameSite: "lax",    // CSRF protection
  expires: expiresAt,
  path: "/",
});
```

**Why database-backed?**
- Instant revocation (delete the row)
- Session metadata (IP, device, last activity)
- Sliding window expiry
- Admin can see/kill active sessions

## Sliding Window Expiry

Don't make active users re-authenticate. Extend the session when they're active:

```typescript
// On each authenticated request:
const session = await getSession(sessionId);
const totalLifetime = 14 * 24 * 60 * 60 * 1000;
const elapsed = Date.now() - session.created_at;

// Refresh when 50% of lifetime consumed
if (elapsed > totalLifetime * 0.5) {
  const newExpiry = new Date(Date.now() + totalLifetime);
  await sql`UPDATE sessions SET expires_at = ${newExpiry} WHERE id = ${sessionId}`;
  // Update cookie expiry too
}
```

## Cookie Security

| Flag | Purpose |
|------|---------|
| `httpOnly` | Prevents JavaScript from reading the cookie (XSS protection) |
| `secure` | Only sent over HTTPS |
| `sameSite: "lax"` | Blocks cross-origin POST requests (CSRF protection) |
| `path: "/"` | Cookie available on all routes |

## JWT Alternative

For stateless APIs or NextAuth integration:

```typescript
// NextAuth config
session: {
  strategy: "jwt",
  maxAge: 7 * 24 * 60 * 60, // 7 days
},
```

**Trade-offs:**
| | Database Sessions | JWT |
|---|---|---|
| Revocation | Instant (delete row) | Must wait for expiry (or maintain blocklist) |
| Size | Small cookie (64 chars) | Larger token (~500 chars) |
| Server load | DB lookup per request | No lookup (token is self-contained) |
| Metadata | Can store anything | Limited by token size |
