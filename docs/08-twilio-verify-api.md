# Twilio Verify API (Managed OTP)

## When to Use Verify vs Custom OTP

| Scenario | Recommendation |
|----------|---------------|
| New project, fast MVP | **Verify** — zero OTP infrastructure needed |
| Multi-channel (SMS + Call + WhatsApp + Email) | **Verify** — all channels built-in |
| Need SNA or Passkeys | **Verify** — exclusive features |
| High fraud risk regions | **Verify** — Fraud Guard built-in |
| Full template control | **Custom** — Verify uses fixed templates |
| Phone verification claims (registration) | **Custom** — complex server-side flows |
| Cost-sensitive at scale | **Custom** — $0.0079/SMS vs $0.05/verify |
| Offline/CI testing | **Custom** — easier to mock |

## Setup

1. Create a Verify Service in Twilio Console
2. Get the Service SID (starts with `VA...`)
3. Set `TWILIO_VERIFY_SERVICE_SID` in your environment

## Usage

```typescript
import { startVerification, checkVerification } from "../lib/twilio-verify";

// Send verification (Twilio generates the code)
const sendResult = await startVerification("+447700900000", "sms");

// Check verification (Twilio validates)
const checkResult = await checkVerification("+447700900000", "482719");
if (checkResult.success) {
  // Phone is verified! Create session/account
}
```

## Channels

| Channel | Code | Notes |
|---------|------|-------|
| SMS | `sms` | Default. Uses Messaging Service or approved sender. |
| Voice Call | `call` | Robot reads code aloud. |
| WhatsApp | `whatsapp` | Requires approved WhatsApp sender. Auto-fallback to SMS. |
| Email | `email` | Requires SendGrid integration. |
| SNA | `sna` | Silent Network Auth — no user input needed. |
| Push | `push` | Requires Verify Push SDK in mobile app. |
| TOTP | `totp` | Time-based codes (authenticator app). |

## Silent Network Authentication (SNA)

The most frictionless verification method. Works by verifying the SIM card via the cellular network.

**How it works:**
1. Backend calls Verify with `channel=sna`
2. Twilio returns an `sna_url`
3. Mobile app opens URL over cellular (not WiFi)
4. Carrier validates SIM against phone number
5. Verification completes in 1-4 seconds, no user input

**Supported:** US, Canada, UK, Germany, France, Spain + more

**Limitations:**
- Requires mobile cellular connection
- Not all carriers supported
- Desktop users need QR code or SMS link fallback
- Requires carrier registration (2-4 weeks)

## Fraud Guard

Built-in protection against SMS pumping. Three levels:

| Level | Behavior | False Positive Rate |
|-------|----------|-------------------|
| Basic | Light filtering | <0.1% |
| Standard (default) | Balanced protection | <1% |
| Max | Aggressive blocking | <2% |

Configure in Console → Verify → Service → Fraud Guard.

## Geo Permissions

Whitelist only countries where you have users:

Console → Verify → Service → Geo Permissions

This prevents SMS pumping to premium-rate destinations.

## Rate Limits

Twilio Verify has built-in rate limits:
- 1 verification per phone per 30 seconds
- 5 failed checks → verification automatically cancelled
- Service-level configurable limits

## Pricing

- $0.05 per successful verification
- Plus channel fees:
  - SMS: $0.0079 (US) — varies by country
  - Voice: $0.013 (US)
  - WhatsApp: $0.005
  - SNA: varies
- Fraud Guard lookups: included
- Failed verifications: channel fee only (no $0.05)
