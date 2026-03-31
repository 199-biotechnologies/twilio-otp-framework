# Testing OTP Flows

## Twilio Test Credentials

Twilio provides test credentials that don't send real messages or incur charges.

```env
# Test credentials (from https://console.twilio.com/us1/account/keys-credentials/api-keys)
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # Your real SID
TWILIO_AUTH_TOKEN="test_auth_token"                       # Use test credentials
```

## Magic Phone Numbers

Twilio has magic numbers for testing different scenarios:

| Number | Behavior | Use Case |
|--------|----------|----------|
| `+15005550006` | Valid, message queued | Happy path |
| `+15005550001` | Invalid number error | Test error handling |
| `+15005550009` | Cannot route error | Test delivery failure |

Set `TWILIO_PHONE_NUMBER="+15005550006"` in your test environment.

## Unit Testing OTP Logic

The OTP library is pure functions — easy to test without Twilio:

```typescript
import { generateOtp, hashOtp, verifyOtp } from "../lib/otp";

describe("OTP", () => {
  test("generates 6-digit codes", () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
    expect(Number(otp)).toBeGreaterThanOrEqual(100000);
    expect(Number(otp)).toBeLessThanOrEqual(999999);
  });

  test("hashing is deterministic", () => {
    const otp = "123456";
    expect(hashOtp(otp)).toBe(hashOtp(otp));
  });

  test("different OTPs produce different hashes", () => {
    expect(hashOtp("123456")).not.toBe(hashOtp("654321"));
  });

  test("verifyOtp returns true for correct code", () => {
    const otp = generateOtp();
    const hash = hashOtp(otp);
    expect(verifyOtp(otp, hash)).toBe(true);
  });

  test("verifyOtp returns false for wrong code", () => {
    const hash = hashOtp("123456");
    expect(verifyOtp("654321", hash)).toBe(false);
  });
});
```

## Mocking the SMS Transport

For integration tests, mock the Twilio HTTP call:

```typescript
// __mocks__/sms.ts
export async function sendSms(to: string, body: string) {
  // Log for assertions instead of calling Twilio
  console.log(`[MOCK SMS] To: ${to}, Body: ${body}`);
  return { success: true, messageSid: "SM_mock_" + Date.now() };
}
```

Or use `msw` (Mock Service Worker) to intercept the fetch:

```typescript
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.post("https://api.twilio.com/2010-04-01/Accounts/*/Messages.json", () => {
    return HttpResponse.json({ sid: "SM_mock_123", status: "queued" });
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());
```

## Testing Rate Limiting

Use in-memory rate limiting (the default fallback) in tests:

```typescript
// Ensure Redis is NOT configured in test env
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

// Now rate-limit.ts uses in-memory store automatically
```

## Testing Webhooks

Create webhook fixture payloads:

```typescript
function createWebhookPayload(overrides: Record<string, string> = {}) {
  return {
    MessageSid: "SM123",
    MessageStatus: "delivered",
    To: "+447700900000",
    From: "+15005550006",
    ...overrides,
  };
}

// Test delivered
const delivered = createWebhookPayload({ MessageStatus: "delivered" });

// Test failed
const failed = createWebhookPayload({
  MessageStatus: "failed",
  ErrorCode: "30003",
  ErrorMessage: "Unreachable destination",
});
```

## End-to-End Testing

For E2E tests that go through the full flow:

1. Use test Twilio credentials
2. Set a known OTP (bypass `generateOtp` with a test override)
3. Call send → verify → check session

```typescript
// test-helpers.ts
let testOtpOverride: string | null = null;

export function setTestOtp(otp: string) {
  testOtpOverride = otp;
}

export function getTestOtp(): string | null {
  return testOtpOverride;
}

// In generateOtp():
export function generateOtp(): string {
  if (process.env.NODE_ENV === "test" && getTestOtp()) {
    return getTestOtp()!;
  }
  return crypto.randomInt(100_000, 1_000_000).toString();
}
```

## Twilio Verify Testing

Twilio Verify has its own test mode:

1. Enable "Test mode" in Console → Verify → Service → Settings
2. Any code works for verification in test mode
3. No real messages are sent

Or use Twilio's magic verification codes documented in their API docs.
