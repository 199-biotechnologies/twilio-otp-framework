# Twilio Webhooks

## Why Validate Webhooks

Without signature validation, anyone can POST to your webhook endpoint and:
- Mark messages as "delivered" (when they weren't)
- Inject fake delivery failures
- Trigger fallback logic maliciously

## Signature Validation

Twilio signs every webhook request with HMAC-SHA1 using your Auth Token.

```typescript
import { validateWebhookRequest } from "../lib/webhook";

export async function POST(request: Request) {
  const isValid = await validateWebhookRequest(request);
  if (!isValid) {
    return new Response("Forbidden", { status: 403 });
  }
  // Process webhook...
}
```

## Status Callback Setup

### Per-Message Callback

Set `StatusCallback` when sending:

```typescript
const params = {
  To: phone,
  From: fromNumber,
  Body: message,
  StatusCallback: "https://yourapp.com/api/twilio/webhook",
};
```

### Service-Level Callback

Configure in Console → Messaging → Services → Integration → Status Callback URL.

## Message Status Flow

```
queued → sending → sent → delivered   (happy path)
queued → sending → sent → undelivered (carrier rejected)
queued → failed                       (immediate failure)
```

## Key Webhook Fields

| Field | Description |
|-------|-------------|
| `MessageSid` | Unique message identifier |
| `MessageStatus` | Current status |
| `To` | Recipient phone |
| `From` | Sender phone/alphanumeric |
| `ErrorCode` | Twilio error code (if failed) |
| `ErrorMessage` | Human-readable error |

## Always Return 200

Twilio retries on non-2xx responses. Always return 200 even if your processing fails, to avoid duplicate webhook deliveries.

```typescript
// Always acknowledge, even on internal errors
try {
  await processWebhook(data);
} catch (err) {
  console.error("[WEBHOOK] Processing error:", err);
}
return new NextResponse("OK", { status: 200 });
```
