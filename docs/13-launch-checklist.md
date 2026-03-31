# Pre-Launch Security Checklist

## OTP Security

- [ ] OTPs generated with `crypto.randomInt` (CSPRNG), not `Math.random`
- [ ] OTPs hashed with HMAC-SHA256 before storage (not plaintext, not plain SHA256)
- [ ] `OTP_HMAC_SECRET` is a strong random value (32+ bytes)
- [ ] OTP TTL is 5 minutes (not longer)
- [ ] OTPs are single-use (atomic DELETE on verification)
- [ ] Max 5 verification attempts per OTP
- [ ] Old OTPs invalidated when new one is requested

## Rate Limiting

- [ ] Per-phone rate limit: 3 sends per 10 minutes
- [ ] Per-IP rate limit: 10 sends per 10 minutes
- [ ] Per-IP verification limit: 10 per 10 minutes
- [ ] Rate limiter uses Redis in production (not in-memory)
- [ ] Rate limiter **fails closed** for auth routes when Redis is down
- [ ] Resend endpoint has stricter limits than initial send

## Timing & Enumeration

- [ ] Timing-safe comparison for OTP hashes (`crypto.timingSafeEqual`)
- [ ] Response time padding on auth endpoints (minimum 500ms)
- [ ] OTP-send returns same response whether phone exists or not
- [ ] Phone numbers masked in all client-facing responses and logs

## Phone Numbers

- [ ] All phones stored in E.164 format
- [ ] Validated with `libphonenumber-js` before storage
- [ ] Unique constraint on phone column (partial: active accounts only)
- [ ] Duplicate phone linking returns user-friendly error

## Sessions

- [ ] Session cookies are `httpOnly` (prevents XSS reading)
- [ ] Session cookies are `secure` in production (HTTPS only)
- [ ] Session cookies use `sameSite: "lax"` (CSRF protection)
- [ ] Sessions stored in database (for revocation)
- [ ] Sessions have reasonable expiry (7-14 days)

## Twilio Configuration

- [ ] `TWILIO_AUTH_TOKEN` is not in client-side code
- [ ] Using Messaging Service SID (not raw From number) in production
- [ ] Webhook endpoints validate Twilio signature
- [ ] Status callback URL configured for delivery tracking
- [ ] A2P 10DLC registered (if sending to US numbers)
- [ ] Alpha Sender ID registered (for international branded SMS)
- [ ] Geo Permissions whitelist only target countries (if using Verify)

## Fraud Prevention

- [ ] Twilio Verify Fraud Guard enabled (if using Verify)
- [ ] Phone intelligence check before sending (Lookup v2 — line type)
- [ ] SMS Pumping Risk score check for international numbers
- [ ] CAPTCHA or bot detection on OTP request form
- [ ] Monitoring conversion rate (verified/sent) with alerts

## Infrastructure

- [ ] No secrets in `.env` committed to git (use `.env.example`)
- [ ] Redis configured and accessible from production
- [ ] Database cleanup jobs scheduled (expired OTPs, sessions, claims)
- [ ] Audit logging active and flowing to monitoring
- [ ] Error alerting configured (low conversion, delivery failures)

## Compliance

- [ ] A2P 10DLC registered for US messaging
- [ ] STOP/opt-out mechanism documented (required for A2P)
- [ ] Alpha Sender countries checked for registration requirements
- [ ] Privacy policy mentions phone number collection and use
- [ ] Phone numbers encrypted at rest (if required by your compliance regime)
