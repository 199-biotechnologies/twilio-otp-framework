# Retry & Fallback Strategies

## Channel Escalation

```
Attempt 1: SMS
    │
    ├── Delivered? → User enters code
    │
    └── User taps "Resend" (60s cooldown)
        │
        Attempt 2: SMS (fresh code)
        │
        └── User taps "Resend" or "Call me instead"
            │
            Attempt 3: Voice call
```

**Implementation:**

```typescript
function resolveChannel(resendCount: number, preferred?: string): Channel {
  if (preferred === "voice" || preferred === "whatsapp") return preferred;
  if (resendCount >= 2) return "voice"; // Auto-escalation
  return "sms";
}
```

## Resend Cooldown

**60 seconds between resends.** Tracked client-side with a countdown timer.

```tsx
const [cooldown, setCooldown] = useState(0);

const handleResend = async () => {
  setCooldown(60);
  await fetch("/api/otp/resend", { method: "POST", body: ... });
};

useEffect(() => {
  if (cooldown > 0) {
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }
}, [cooldown]);

<button disabled={cooldown > 0} onClick={handleResend}>
  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
</button>
```

## Webhook-Driven Fallback

Use Twilio status callbacks to auto-trigger voice when SMS fails:

```typescript
// In your webhook handler:
if (status === "undelivered" || status === "failed") {
  const errorCode = formData.get("ErrorCode");

  // Carrier/delivery errors → try voice
  if (["30003", "30004", "30005", "30006"].includes(errorCode)) {
    await sendVoiceOtp(to, /* retrieve OTP from active record */);
    await logAuditEvent("otp.voice_fallback", { phone: to });
  }
}
```

## Twilio Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 30003 | Unreachable destination | Try voice call |
| 30004 | Blocked by carrier | Try voice/WhatsApp |
| 30005 | Unknown destination | Invalid number — stop |
| 30006 | Landline or unreachable | Try voice call |
| 30007 | Content blocked | Check message content |
| 21610 | User opted out (STOP) | Do not retry |

## Exponential Backoff for API Failures

If Twilio returns a 5xx or network error, retry with backoff:

```typescript
async function sendWithRetry(
  fn: () => Promise<{ success: boolean; error?: string }>,
  maxRetries: number = 3
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();
    if (result.success) return result;

    // Don't retry client errors (4xx)
    if (result.error?.includes("4")) return result;

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  return { success: false, error: "Failed after retries" };
}
```

## WhatsApp Auto-Fallback

Twilio Verify (as of April 2025) supports automatic WhatsApp-to-SMS fallback. If the WhatsApp message isn't read within a configurable timeout, it automatically sends via SMS.

```
WhatsApp sent → Not read in 60s → SMS auto-sent
```

This is enabled by default on Twilio Verify. No code changes needed.
