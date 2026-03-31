# Security & Hardening

## OTP Hashing

**Never store OTPs in plaintext.** A database breach would expose all active codes.

```typescript
// HMAC-SHA256 with a server secret
function hashOtp(otp: string): string {
  return crypto.createHmac("sha256", OTP_HMAC_SECRET).update(otp).digest("hex");
}
```

**Why HMAC, not plain SHA256?**
A 6-digit OTP has only 900,000 possibilities. Plain SHA256 can be brute-forced in milliseconds. HMAC requires the server secret, adding a layer even if the DB is compromised.

## Timing Attack Prevention

### Hash Comparison

Always use timing-safe comparison:

```typescript
// GOOD: Constant-time comparison
crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));

// BAD: Variable-time (leaks character-by-character match info)
inputHash === storedHash;
```

### Response Timing

Pad all auth responses to a minimum duration:

```typescript
const timer = startTimingGuard(500); // 500ms minimum
// ... process request ...
await timer.wait(); // Ensures consistent response time
return response;
```

**Why?** If "user not found" returns in 2ms and "wrong code" returns in 50ms, attackers can enumerate valid phone numbers by timing the responses.

## User Enumeration Prevention

Return identical responses for both paths:

```typescript
// GOOD: Same response regardless of user existence
return { success: true, message: "If this number is registered, you will receive a code." };

// BAD: Reveals whether phone is registered
return { error: "No account found for this phone number." }; // 404
```

**When to break this rule:** Login flows where the user *expects* to know if their account exists. But OTP-send endpoints should always be opaque.

## Brute Force Protection

Three layers:

```
Layer 1: Per-OTP attempt counter (5 max)
    "5 wrong guesses → code is invalidated"

Layer 2: Per-IP rate limit (10 per 10 min)
    "Can't try unlimited phones from one IP"

Layer 3: Per-phone rate limit (3 sends per 10 min)
    "Can't request unlimited new codes for one phone"
```

## Replay Attack Prevention

OTPs are single-use. The atomic DELETE pattern ensures this:

```sql
DELETE FROM sms_otps WHERE id = $1 RETURNING *;
```

If two requests hit simultaneously, only one gets the row.

## Phone Intelligence (Pre-Send Checks)

Before spending money on SMS delivery, check the number:

```typescript
import { lookupPhone, shouldBlockPhone } from "../lib/security";

const lookup = await lookupPhone(phone);
const block = shouldBlockPhone(lookup, {
  allowVoip: false,      // Block burner VoIP numbers
  allowLandline: false,  // Landlines can't receive SMS
  allowedCountries: ["GB", "US", "DE", "FR"], // Geo-restrict
});

if (block.blocked) {
  return error(block.reason);
}
```

**Twilio Lookup v2 data packages:**

| Package | Use | Cost |
|---------|-----|------|
| Line Type Intelligence | Block VoIP/landline | $0.005 |
| SMS Pumping Risk | Fraud score 0-100 | $0.005 |
| SIM Swap | Detect account takeover | $0.03 |
| Identity Match | KYC verification | $0.03 |

## SMS Pumping Fraud Prevention

SMS pumping = attackers trigger thousands of OTPs to premium-rate numbers, earning per-message revenue.

### Defense Stack

```
1. Twilio Verify Fraud Guard (Standard level)
   - Blocks known pumping patterns automatically

2. Lookup v2: SMS Pumping Risk Score
   - Query before every OTP send
   - Reject score > 50
   - Do NOT cache (scores change in seconds)

3. Geo Permissions
   - Whitelist only countries you serve
   - Console → Verify → Geo Permissions

4. Application-Level
   - CAPTCHA before OTP form
   - Rate limit: 1 OTP per 30s per phone
   - Monitor conversion rate: verified/sent < 20% = alarm
   - Block VPN/TOR/cloud provider IPs

5. Line Type Intelligence
   - Only send to mobile numbers
   - Reject non-fixed VoIP, landline, premium
```

## Request Origin Validation

Validate that API requests come from your frontend:

```typescript
function validateRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const sourceHost = new URL(origin).hostname;
  return allowedHosts.includes(sourceHost);
}
```

## Soft Deletes & Re-registration

Prevent deleted accounts from being re-registered:

```sql
-- Partial unique index: only active accounts
CREATE UNIQUE INDEX idx_users_phone_active ON users (phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
```

```typescript
// Check for soft-deleted account
const deleted = await sql`SELECT 1 FROM users WHERE phone = ${phone} AND deleted_at IS NOT NULL`;
if (deleted.length > 0) {
  return error("This number cannot be used for registration.");
}
```

## A2P 10DLC Compliance (US)

If sending to US numbers, you **must** register for A2P 10DLC:

1. **Brand Registration** ($46 one-time)
2. **Campaign Registration** ($15 vetting + $2-10/month)
3. Associate Messaging Service + phone number

Without registration, US messages will be filtered/blocked by carriers.

## Checklist

- [ ] OTPs hashed with HMAC-SHA256 (not plaintext, not plain SHA256)
- [ ] Timing-safe hash comparison (`crypto.timingSafeEqual`)
- [ ] Response time padding (prevents enumeration)
- [ ] Per-OTP brute force limit (5 attempts)
- [ ] Per-phone rate limit (3 sends per 10 min)
- [ ] Per-IP rate limit (10 per 10 min)
- [ ] Rate limiter fails closed in production
- [ ] OTPs deleted atomically on success (single-use)
- [ ] Phone numbers in E.164 format
- [ ] HTTP-only secure cookies for sessions
- [ ] Audit logging for all OTP events
- [ ] Twilio webhook signature validation
- [ ] No secrets in client-side code or logs
- [ ] Phone numbers masked in logs and error responses
