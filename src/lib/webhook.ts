/**
 * Twilio Webhook Validation
 *
 * When Twilio sends status callbacks or incoming messages to your server,
 * you MUST validate that the request actually came from Twilio.
 *
 * Without validation, anyone can POST to your webhook endpoint
 * and trigger actions (e.g., marking messages as delivered).
 *
 * Twilio signs every request with your Auth Token using HMAC-SHA1.
 */
import crypto from "crypto";

const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();

/**
 * Validate a Twilio webhook request signature.
 *
 * How it works:
 * 1. Twilio constructs a string: your webhook URL + sorted POST params
 * 2. Signs it with HMAC-SHA1 using your Auth Token
 * 3. Sends the signature in the X-Twilio-Signature header
 * 4. You reconstruct the same signature and compare
 *
 * @param url - The full URL Twilio sent the request to (must match exactly)
 * @param params - The POST body parameters
 * @param signature - The X-Twilio-Signature header value
 * @returns true if the request is authentic
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  if (!TWILIO_TOKEN) {
    console.error("[WEBHOOK] Cannot validate — TWILIO_AUTH_TOKEN not set");
    return false;
  }

  // Build the data string: URL + sorted key-value pairs
  const data =
    url +
    Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], "");

  // Compute expected signature
  const expected = crypto
    .createHmac("sha1", TWILIO_TOKEN)
    .update(data)
    .digest("base64");

  // Timing-safe comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Express/Next.js middleware helper for webhook validation.
 *
 * Usage in Next.js App Router:
 * ```ts
 * export async function POST(request: Request) {
 *   const isValid = await validateWebhookRequest(request);
 *   if (!isValid) {
 *     return new Response("Forbidden", { status: 403 });
 *   }
 *   // Process the webhook...
 * }
 * ```
 */
export async function validateWebhookRequest(request: Request): Promise<boolean> {
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) return false;

  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  // The URL must match exactly what Twilio was configured to call
  const url = request.url;

  return validateTwilioSignature(url, params, signature);
}
