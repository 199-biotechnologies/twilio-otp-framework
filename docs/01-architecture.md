# Architecture Overview

## System Design

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Phone Input  │  │  OTP Input   │  │ Channel Selector  │  │
│  │ (E.164 fmt)  │  │  (6 digits)  │  │ (SMS/Call/WA)    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │             │
└─────────┼──────────────────┼────────────────────┼────────────┘
          │                  │                    │
          ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      API LAYER                               │
│                                                              │
│  POST /api/otp/send ──────────────────────────────────────  │
│    1. Validate & normalize phone (E.164)                     │
│    2. Rate limit (per-phone + per-IP)                        │
│    3. Pre-check: Lookup v2 (line type, SMS pumping risk)     │
│    4. Invalidate existing OTPs                               │
│    5. Generate → HMAC-SHA256 hash → store                    │
│    6. Send via Twilio (SMS/Voice/WhatsApp)                   │
│    7. Audit log                                              │
│                                                              │
│  POST /api/otp/verify ────────────────────────────────────  │
│    1. Rate limit (per-IP)                                    │
│    2. Fetch stored OTP hash                                  │
│    3. Check brute force (5 attempts max)                     │
│    4. Timing-safe hash comparison                            │
│    5. Atomic delete (single-use)                             │
│    6. Create session / issue claim token                     │
│    7. Audit log                                              │
│                                                              │
│  POST /api/otp/resend ────────────────────────────────────  │
│    1. Rate limit (stricter)                                  │
│    2. Channel escalation (SMS → SMS → Voice)                 │
│    3. Fresh code generation                                  │
│                                                              │
│  POST /api/twilio/webhook ────────────────────────────────  │
│    1. Validate Twilio signature                              │
│    2. Track delivery status                                  │
│    3. Trigger voice fallback on SMS failure                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  PostgreSQL  │ │  Redis   │ │    Twilio     │
│              │ │ (Upstash)│ │              │
│ • sms_otps   │ │          │ │ • Messages   │
│ • users      │ │ • Rate   │ │ • Calls      │
│ • sessions   │ │   limits │ │ • Verify     │
│ • claims     │ │          │ │ • Lookup v2  │
│ • audit_log  │ │          │ │ • Webhooks   │
└──────────────┘ └──────────┘ └──────────────┘
```

## Two Approaches

### Option A: Custom OTP (This Framework)

You generate, hash, store, and verify OTP codes yourself. Twilio is just the delivery pipe.

**Best when:**
- Full control over verification flow
- Complex flows (phone claims for registration)
- Cost-sensitive at scale ($0.0079/SMS vs $0.05/verify)
- Custom message templates
- Need offline testing

### Option B: Twilio Verify API (Managed)

Twilio handles everything: generation, delivery, rate limiting, verification.

**Best when:**
- Speed to market
- Multi-channel without building each (SMS, Voice, WhatsApp, Email, SNA, Push)
- Built-in fraud protection (Fraud Guard saved $62.7M for customers 2022-2024)
- Don't want to manage OTP database tables
- Need SNA (Silent Network Auth) or Passkeys

### Recommended: Hybrid

Use **Twilio Verify** as your primary path, with custom OTP code as reference for when you need full control or specific flows like phone verification claims.

## Security Layers

```
Layer 1: Input Validation ─── E.164 format, phone normalization
Layer 2: Rate Limiting ────── Per-phone (3/10min) + Per-IP (10/10min)
Layer 3: Phone Intelligence ─ Lookup v2: line type, SMS pumping risk
Layer 4: Fraud Guard ──────── Twilio Verify built-in fraud detection
Layer 5: OTP Security ─────── HMAC-SHA256 hash, 5-min TTL, 5 attempts
Layer 6: Timing Safety ────── Constant-time comparison, response padding
Layer 7: Session Security ──── HTTP-only cookies, sliding expiry
Layer 8: Audit Trail ──────── All events logged for investigation
```
