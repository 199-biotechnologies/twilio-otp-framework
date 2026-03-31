/**
 * WhatsApp OTP Channel
 *
 * Send OTP codes via WhatsApp using Twilio's WhatsApp Business API.
 * Requires a Twilio-approved WhatsApp sender (number or template).
 *
 * Prerequisites:
 * - WhatsApp-enabled Twilio number or approved sender
 * - Pre-approved message template for OTP delivery
 * - WhatsApp Business API access in your Twilio account
 */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();
const TWILIO_WHATSAPP_FROM =
  process.env.TWILIO_WHATSAPP_NUMBER?.trim() || "whatsapp:+14155238886"; // Twilio sandbox default

export interface WhatsAppResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

/**
 * Send an OTP via WhatsApp.
 *
 * When to use WhatsApp:
 * - User preference (common in LATAM, India, Europe)
 * - SMS delivery is unreliable in the user's region
 * - Cost optimization (WhatsApp is cheaper than SMS in many countries)
 *
 * Limitations:
 * - Requires user to have WhatsApp installed
 * - 24-hour session window for freeform messages
 * - Must use approved templates for out-of-session messages
 */
export async function sendWhatsAppOtp(
  to: string,
  otp: string,
  appName: string = "Your App"
): Promise<WhatsAppResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return { success: false, error: "Twilio not configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

  // WhatsApp numbers must be prefixed with "whatsapp:"
  const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const whatsappFrom = TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: whatsappTo,
        From: whatsappFrom,
        Body: `Your ${appName} verification code is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`[WHATSAPP] Failed: Twilio ${data.code}: ${data.message}`);
      return { success: false, error: `Twilio ${data.code}: ${data.message}` };
    }

    console.log(`[WHATSAPP] Sent — SID: ${data.sid}`);
    return { success: true, messageSid: data.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[WHATSAPP] Network error: ${msg}`);
    return { success: false, error: msg };
  }
}
