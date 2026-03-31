# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in this framework, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: security@199.bio
3. Include: description, steps to reproduce, potential impact

We will respond within 48 hours and work with you to address the issue.

## Scope

This is a **reference framework**, not a production package. When adapting this code:

- Generate your own `OTP_HMAC_SECRET` (don't reuse examples)
- Audit all environment variables before deploying
- Review rate limit thresholds for your use case
- Test your specific Twilio configuration

## Known Security Considerations

1. **In-memory rate limiting** is per-instance (not shared across serverless functions). Always use Redis in production.
2. **Phone intelligence checks** (Lookup v2) add latency (~200ms). Balance security vs UX.
3. **Voice call OTP** is less secure than SMS (more susceptible to call forwarding attacks). Consider Twilio Lookup Call Forwarding detection.
4. **Alpha Sender IDs** are one-way only. Ensure alternative opt-out mechanisms.
