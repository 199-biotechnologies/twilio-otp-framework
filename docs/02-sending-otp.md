# Sending OTP

## Channels

### SMS (Default)

The most common delivery channel. Works on all phones.

```typescript
import { sendSms } from "../lib/sms";

const result = await sendSms("+447700900000", "Your code is: 482719");
// { success: true, messageSid: "SM..." }
```

**Two sender options:**

| Method | When to Use |
|--------|-------------|
| **Messaging Service SID** | Production. Handles number pools, compliance, A2P 10DLC, Alpha Sender. |
| **From number** | Development/testing. Single dedicated number. |

### Voice Call (Fallback)

For users who don't receive SMS (carrier blocks, landlines, VoIP).

```typescript
import { sendVoiceOtp } from "../lib/voice";

const result = await sendVoiceOtp("+447700900000", "482719");
// Calls the user: "Your code is: 4. 8. 2. 7. 1. 9. I repeat: 4. 8. 2. 7. 1. 9."
```

### WhatsApp

Popular in LATAM, India, Europe. Cheaper than SMS in many countries.

```typescript
import { sendWhatsAppOtp } from "../lib/whatsapp";

const result = await sendWhatsAppOtp("+447700900000", "482719", "Healtrix");
```

**Requires:** WhatsApp-enabled Twilio number or approved sender + pre-approved message template.

### Twilio Verify (Managed)

Twilio generates, sends, and verifies. You don't store anything.

```typescript
import { startVerification, checkVerification } from "../lib/twilio-verify";

// Send
await startVerification("+447700900000", "sms");

// Verify (Twilio handles hash comparison, attempts, expiry)
const result = await checkVerification("+447700900000", "482719");
// { success: true, status: "approved" }
```

## Alpha Sender IDs (Branded SMS)

Send from "HEALTRIX" instead of a phone number.

**Setup:**
1. Console → Programmable Messaging → Settings → Messaging Services
2. Add Sender → Alpha Sender → enter your brand name (max 11 chars)
3. Messages to supported countries automatically use Alpha Sender

**Supported countries:** UK, Germany, France, Spain, Australia, most of Europe, Middle East, Asia
**NOT supported:** US, Canada (must use 10DLC or short codes)

**Limitations:**
- One-way only (recipients can't reply)
- Twilio's STOP keyword doesn't work — provide alternative opt-out
- Some carriers enforce minimum length

## Channel Escalation Strategy

```
1st attempt: SMS (most universal)
   │
   ├── Success → User enters code
   │
   └── User taps "Resend" (60s cooldown)
       │
       2nd attempt: SMS (fresh code)
       │
       └── User taps "Resend" again
           │
           3rd attempt: Voice call
           OR: User taps "Call me instead" → Voice call
```

## Message Templates

```
SMS:
"Your [App] verification code is: 482719

This code expires in 5 minutes. Do not share it."

Voice:
"Your verification code is: 4. 8. 2. 7. 1. 9.
I repeat: 4. 8. 2. 7. 1. 9.
Goodbye."
```

**Best practices:**
- Include app name for trust
- State expiry time
- Warn not to share
- Keep under 160 chars for single-segment SMS
- Spell out digits in voice with pauses

## Direct REST vs Twilio SDK

This framework uses **direct REST API calls** (no `twilio` npm package).

| | Direct REST | Twilio SDK |
|---|---|---|
| Bundle size | 0 KB (uses `fetch`) | ~5 MB |
| Edge runtime | Works | Doesn't work |
| Control | Full | Abstracted |
| Updates | Manual | Package updates |

For serverless/edge deployments, direct REST is strongly recommended.
