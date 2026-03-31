<div align="center">

# Twilio OTP Framework

**Production-grade phone verification for Next.js — SMS, voice calls, WhatsApp, fraud prevention, and everything in between.**

<br />

[![Star this repo](https://img.shields.io/github/stars/199-biotechnologies/twilio-otp-framework?style=for-the-badge&logo=github&label=%E2%AD%90%20Star%20this%20repo&color=yellow)](https://github.com/199-biotechnologies/twilio-otp-framework/stargazers)
&nbsp;&nbsp;
[![Follow @longevityboris](https://img.shields.io/badge/Follow_%40longevityboris-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/longevityboris)

<br />

[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
&nbsp;
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](src/)
&nbsp;
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](docs/)
&nbsp;
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)

---

Every project eventually needs phone verification. You search "Twilio OTP," find a blog post from 2019, copy-paste some code, ship it, and hope nobody finds the holes you left open. No rate limiting. No brute force protection. No fraud prevention. Plain-text codes sitting in your database.

This framework is what we wish existed when we built phone auth for [Healtrix](https://health.199.clinic) and [Petus AI](https://petus.ai). Battle-tested patterns extracted from production, documented so an AI agent (or a human) can implement OTP correctly on the first try.

[Architecture](#architecture) | [What's Inside](#whats-inside) | [Quick Start](#quick-start) | [Features](#features) | [Docs](#documentation) | [Contributing](#contributing)

</div>

## The Problem

Most OTP implementations are dangerously incomplete:

| What most tutorials ship | What production actually needs |
|---|---|
| Plain SHA256 hash (brute-forced in seconds) | HMAC-SHA256 with server secret |
| No rate limiting | Per-phone + per-IP + fail-closed when Redis is down |
| SMS only, no fallback | SMS → Voice call → WhatsApp escalation |
| `Math.random()` for code generation | `crypto.randomInt()` (CSPRNG) |
| OTP stored until expiry | Atomic single-use deletion |
| No fraud prevention | Twilio Lookup v2 + SMS pumping risk scores |
| No delivery tracking | Webhook validation + status callbacks |
| Phone stored as-is | E.164 normalization with `libphonenumber-js` |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                       CLIENT                             │
│  Phone Input (E.164) → OTP Input (6-digit) → Session    │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                     API LAYER                            │
│                                                          │
│  POST /api/otp/send ──── Rate limit → Lookup → Hash     │
│                          → Store → Send (SMS/Voice/WA)   │
│                                                          │
│  POST /api/otp/verify ── Rate limit → Brute force check  │
│                          → Timing-safe compare            │
│                          → Atomic delete → Session        │
│                                                          │
│  POST /api/otp/resend ── Channel escalation              │
│                          (SMS → SMS → Voice)              │
│                                                          │
│  POST /api/twilio/webhook ── Signature validation        │
│                              → Delivery tracking          │
└───────┬──────────┬──────────┬───────────────────────────┘
        │          │          │
   PostgreSQL    Redis     Twilio
   (OTPs, users, (Rate    (SMS, Voice,
    sessions,    limits)   WhatsApp,
    audit log)             Verify, Lookup)
```

## What's Inside

```
twilio-otp-framework/
├── src/
│   ├── components/
│   │   ├── PhoneInput.tsx        # International phone input with flags
│   │   ├── OtpInput.tsx          # 6-digit code with paste + auto-advance
│   │   ├── VerificationFlow.tsx  # Complete phone → OTP → verified flow
│   │   ├── LoginWithPhone.tsx    # Dual-mode login box (Email / Phone)
│   │   └── index.ts             # Barrel export
│   ├── lib/
│   │   ├── otp.ts               # Generation + HMAC-SHA256 hashing
│   │   ├── sms.ts               # Twilio SMS (direct REST, no SDK)
│   │   ├── voice.ts             # Voice call OTP fallback
│   │   ├── whatsapp.ts          # WhatsApp OTP channel
│   │   ├── twilio-verify.ts     # Twilio Verify API (managed alternative)
│   │   ├── rate-limit.ts        # Multi-tier: Redis + in-memory + fail-closed
│   │   ├── phone.ts             # E.164 normalization + validation
│   │   ├── webhook.ts           # Twilio signature validation
│   │   ├── session.ts           # DB-backed sessions + HTTP-only cookies
│   │   ├── security.ts          # Timing guards, phone intelligence, geo-blocking
│   │   └── audit.ts             # Fire-and-forget event logging
│   ├── api/
│   │   ├── send-otp/route.ts    # Send OTP endpoint
│   │   ├── verify-otp/route.ts  # Verify OTP endpoint
│   │   ├── resend-otp/route.ts  # Resend with channel escalation
│   │   └── twilio-webhook/      # Delivery status callbacks
│   └── db/
│       └── schema.sql           # Complete PostgreSQL schema
├── docs/                        # 16 in-depth guides (see below)
├── .env.example                 # All env vars documented
├── SECURITY.md                  # Vulnerability reporting
└── LICENSE                      # MIT
```

## Quick Start

**1. Clone and explore**
```bash
git clone https://github.com/199-biotechnologies/twilio-otp-framework.git
cd twilio-otp-framework
```

**2. Copy the modules you need into your Next.js project**
```bash
# Copy the core OTP library
cp src/lib/otp.ts your-project/lib/
cp src/lib/sms.ts your-project/lib/
cp src/lib/rate-limit.ts your-project/lib/
cp src/lib/phone.ts your-project/lib/

# Copy the API routes (rename directories to match your routing)
cp src/api/send-otp/route.ts your-project/app/api/otp/send/route.ts
cp src/api/verify-otp/route.ts your-project/app/api/otp/verify/route.ts
cp src/api/resend-otp/route.ts your-project/app/api/otp/resend/route.ts
```

**3. Set up your database**
```bash
psql $DATABASE_URL < src/db/schema.sql
```

**4. Configure environment**
```bash
cp .env.example .env.local
# Fill in your Twilio credentials, OTP_HMAC_SECRET, and database URL
```

This is a **reference framework**, not a runnable app or npm package. The library code is copy-paste ready, but SQL queries are commented out with `// await sql` — you need to adapt them to your ORM (Drizzle, Prisma, raw SQL). The patterns, security decisions, and architecture are production-tested; the wiring is yours to do.

## Features

### Delivery Channels

| Channel | File | When to Use |
|---------|------|-------------|
| **SMS** | `sms.ts` | Default for all users |
| **Voice Call** | `voice.ts` | SMS delivery fails, user requests call, landline detected |
| **WhatsApp** | `whatsapp.ts` | User preference, cheaper in LATAM/India/Europe |
| **Twilio Verify** | `twilio-verify.ts` | Managed OTP — Twilio handles everything |

### Security Stack

| Layer | Protection | Details |
|-------|-----------|---------|
| **Hashing** | HMAC-SHA256 with server secret | DB breach doesn't expose valid codes |
| **Brute Force** | 5 attempts per OTP | Code invalidated after max attempts |
| **Rate Limiting** | Per-phone (3/10min) + per-IP (10/10min) | Fail-closed when Redis is down |
| **Timing Safety** | `crypto.timingSafeEqual` + response padding | Prevents enumeration via timing |
| **Single Use** | Atomic DELETE on verification | No replay attacks |
| **Phone Intelligence** | Twilio Lookup v2 | Block VoIP, detect SMS pumping, SIM swap |
| **Fraud Guard** | Twilio Verify built-in | Blocks known pumping patterns |
| **Geo Permissions** | Country whitelist | Only send to countries you serve |

### Phone Management

- **E.164 normalization** — `"07700 900000"` → `"+447700900000"`
- **Duplicate protection** — partial unique indexes for active accounts
- **Phone verification claims** — server-side proof of ownership for registration
- **Alpha Sender IDs** — branded SMS ("HEALTRIX" instead of a phone number)
- **A2P 10DLC compliance** — US carrier registration guide

### Ready-to-Use UI Components (`src/components/`)

Four React components you can drop into any Next.js project:

| Component | What It Does |
|-----------|-------------|
| **`PhoneInput`** | International input with country flags, E.164 output, validation |
| **`OtpInput`** | 6-digit code with auto-advance, paste support, `autocomplete="one-time-code"` for browser SMS auto-fill |
| **`VerificationFlow`** | Complete phone → send code → enter code → verified. Resend timer, channel escalation, "Call me instead" |
| **`LoginWithPhone`** | Dual-mode login box (Email magic link / Phone OTP) with tab switcher. Plug in your endpoints and go. |

```tsx
// One component, entire verification flow
<VerificationFlow
  onVerified={(phone) => router.push("/dashboard")}
  defaultCountry="GB"
  appName="Healtrix"
/>

// Or the full login box with email + phone tabs
<LoginWithPhone
  onAuthenticated={(result) => handleLogin(result)}
  modes={["phone", "email"]}
  brandName="Sign in to Healtrix"
  brandLogo="/logo.svg"
/>
```

All components use Tailwind CSS classes. Swap the classes for your design system.

## Documentation

Every doc is self-contained with code snippets you can copy directly:

| # | Guide | What You'll Learn |
|---|-------|-------------------|
| 01 | [Architecture](docs/01-architecture.md) | System design, security layers, Custom vs Verify decision |
| 02 | [Sending OTP](docs/02-sending-otp.md) | SMS, Voice, WhatsApp, Alpha Sender, REST vs SDK |
| 03 | [Verification](docs/03-verification.md) | Login flow, registration claims, phone linking, atomic ops |
| 04 | [Rate Limiting](docs/04-rate-limiting.md) | Multi-tier limits, Redis + in-memory, fail-closed |
| 05 | [Security & Hardening](docs/05-security-hardening.md) | HMAC hashing, timing attacks, fraud prevention, SMS pumping |
| 06 | [Phone Management](docs/06-phone-management.md) | E.164, normalization, linking patterns, duplicate protection |
| 07 | [Retry & Fallback](docs/07-retry-fallback.md) | Channel escalation, webhook-driven fallback, backoff |
| 08 | [Twilio Verify API](docs/08-twilio-verify-api.md) | Managed OTP, SNA, Passkeys, Fraud Guard, pricing |
| 09 | [Webhooks](docs/09-webhooks.md) | Signature validation, delivery tracking, error codes |
| 10 | [Session Management](docs/10-session-management.md) | DB-backed sessions, sliding window, cookie security |
| 11 | [Frontend Patterns](docs/11-frontend-patterns.md) | Phone input, OTP input, verification flow components |
| 12 | [Monitoring & Audit](docs/12-monitoring-audit.md) | Event logging, conversion tracking, alerting |
| 13 | [Launch Checklist](docs/13-launch-checklist.md) | Pre-production security review |
| 14 | [Integrations](docs/14-integrations.md) | Supabase Auth, NextAuth, better-auth, Stripe |
| 15 | [Testing](docs/15-testing.md) | Test credentials, mocking, webhook fixtures, E2E |
| 16 | [Privacy & Compliance](docs/16-privacy-compliance.md) | GDPR, data retention, encryption, Twilio as processor |

## Custom OTP vs Twilio Verify

Both approaches are fully documented. Here's how to choose:

| | Custom OTP (this repo) | Twilio Verify |
|---|---|---|
| **You control** | Everything | Channel + Fraud Guard level |
| **OTP storage** | Your database (hashed) | Twilio's infrastructure |
| **Rate limiting** | You build it | Built-in |
| **Fraud prevention** | Lookup v2 + your logic | Fraud Guard (saved $62.7M for customers) |
| **Channels** | Whatever you build | SMS, Voice, WhatsApp, Email, SNA, Push, TOTP, Passkeys |
| **Cost** | ~$0.008/SMS (US) | $0.05/verification + channel fee |
| **Best for** | Full control, complex flows, cost at scale | Fast MVP, multi-channel, built-in fraud protection |

**Our recommendation:** Start with Twilio Verify for speed. Switch to custom when you need phone verification claims or tighter cost control at scale.

## For AI Agents

This repo is designed to be read by AI coding agents. When pointing an agent at this framework:

```
Reference https://github.com/199-biotechnologies/twilio-otp-framework
for implementing phone OTP authentication. Use the patterns from
src/lib/ for the core logic and docs/ for security requirements.
```

Every file has clear JSDoc comments explaining *why* each decision was made. The docs cover edge cases and mistakes that will bite you in production.

## Contributing

Found a gap? Have a better pattern? PRs are welcome.

1. Fork the repo
2. Make your changes
3. Open a PR with context on what you improved and why

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT — use this however you want.

---

<div align="center">

Built by [Boris Djordjevic](https://github.com/longevityboris) at [199 Biotechnologies](https://github.com/199-biotechnologies) | [Paperfoot AI](https://paperfoot.ai)

<br />

**If this saves you time:**

[![Star this repo](https://img.shields.io/github/stars/199-biotechnologies/twilio-otp-framework?style=for-the-badge&logo=github&label=%E2%AD%90%20Star%20this%20repo&color=yellow)](https://github.com/199-biotechnologies/twilio-otp-framework/stargazers)
&nbsp;&nbsp;
[![Follow @longevityboris](https://img.shields.io/badge/Follow_%40longevityboris-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/longevityboris)

</div>
