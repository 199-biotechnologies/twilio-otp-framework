/**
 * Twilio SMS Sending (Direct REST API — no SDK dependency)
 *
 * Uses the Twilio REST API directly for lighter deployments.
 * Supports both Messaging Service SID (recommended for production)
 * and a dedicated From number.
 */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER?.trim();
const TWILIO_MSG_SVC = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();

export interface SmsResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

/**
 * Send an SMS via Twilio REST API.
 *
 * Why REST instead of the SDK?
 * - Zero dependencies (no twilio package — saves ~5MB in serverless)
 * - Works in edge runtimes (Vercel Edge, Cloudflare Workers)
 * - Full control over error handling and retries
 *
 * Why Messaging Service SID over a From number?
 * - Automatic number pool management
 * - Better deliverability (Twilio picks optimal sender)
 * - Built-in compliance features
 * - Required for A2P 10DLC in the US
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.warn("[SMS] Twilio not configured — skipping send");
    return { success: false, error: "Twilio not configured" };
  }

  if (!TWILIO_MSG_SVC && !TWILIO_FROM) {
    return { success: false, error: "No MessagingServiceSid or From number" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

  // Prefer MessagingServiceSid over From number
  const params: Record<string, string> = TWILIO_MSG_SVC
    ? { To: to, MessagingServiceSid: TWILIO_MSG_SVC, Body: body }
    : { To: to, From: TWILIO_FROM!, Body: body };

  // Add status callback URL if configured
  const callbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (callbackUrl) {
    params.StatusCallback = callbackUrl;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    const data = await res.json();

    if (!res.ok) {
      const twilioError = `Twilio ${data.code}: ${data.message}`;
      console.error(`[SMS] Failed to send to ${maskPhone(to)}: ${twilioError}`);
      return { success: false, error: twilioError };
    }

    console.log(`[SMS] Sent to ${maskPhone(to)} — SID: ${data.sid}`);
    return { success: true, messageSid: data.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[SMS] Network error sending to ${maskPhone(to)}: ${msg}`);
    return { success: false, error: msg };
  }
}

/** Mask phone number for logging: +447700900000 → +44****0000 */
function maskPhone(phone: string): string {
  if (phone.length < 8) return "***";
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}
