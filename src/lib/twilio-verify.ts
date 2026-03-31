/**
 * Twilio Verify API — Managed OTP Service
 *
 * Alternative to custom OTP: Twilio handles generation, delivery,
 * rate limiting, and verification. You don't store OTPs at all.
 *
 * Trade-offs vs Custom OTP:
 * ┌─────────────────┬──────────────────┬──────────────────┐
 * │                 │ Twilio Verify    │ Custom OTP       │
 * ├─────────────────┼──────────────────┼──────────────────┤
 * │ Complexity      │ Low (API calls)  │ High (DB, hash)  │
 * │ Cost            │ $0.05/verify     │ $0.0079/SMS      │
 * │ Rate limiting   │ Built-in         │ You build it     │
 * │ Channels        │ SMS/Call/Email/WA │ You build each   │
 * │ Customization   │ Limited          │ Full control     │
 * │ DB required     │ No               │ Yes              │
 * │ Offline/testing │ Hard to mock     │ Easy to test     │
 * └─────────────────┴──────────────────┴──────────────────┘
 *
 * Use Verify when: speed to market matters, you want built-in fraud
 * protection, or you need multi-channel without building each.
 *
 * Use Custom when: you need full control, cost matters at scale,
 * or you have complex verification flows (e.g., phone claims).
 */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

export type VerifyChannel = "sms" | "call" | "whatsapp" | "email";

export interface VerifyResult {
  success: boolean;
  status?: string;
  error?: string;
}

/**
 * Start a verification — Twilio sends the code via chosen channel.
 * You do NOT generate or store the OTP. Twilio handles everything.
 */
export async function startVerification(
  to: string,
  channel: VerifyChannel = "sms"
): Promise<VerifyResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !VERIFY_SERVICE_SID) {
    return { success: false, error: "Twilio Verify not configured" };
  }

  const url = `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE_SID}/Verifications`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, Channel: channel }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.message || "Verify API error" };
    }

    return { success: true, status: data.status };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Check a verification code. Twilio validates and returns approved/pending.
 *
 * Important: Twilio Verify has built-in brute-force protection.
 * After 5 failed attempts, the verification is automatically cancelled.
 */
export async function checkVerification(
  to: string,
  code: string
): Promise<VerifyResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !VERIFY_SERVICE_SID) {
    return { success: false, error: "Twilio Verify not configured" };
  }

  const url = `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE_SID}/VerificationChecks`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, Code: code }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.message || "Verify API error" };
    }

    return {
      success: data.status === "approved",
      status: data.status,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
