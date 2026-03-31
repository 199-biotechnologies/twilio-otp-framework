/**
 * Voice Call OTP Fallback
 *
 * When SMS delivery fails or the user requests a call,
 * Twilio can read the OTP aloud via a phone call.
 *
 * This uses Twilio's Calls API with TwiML to speak the code.
 */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();
const TWILIO_FROM = process.env.TWILIO_VOICE_NUMBER?.trim() || process.env.TWILIO_PHONE_NUMBER?.trim();

export interface VoiceResult {
  success: boolean;
  callSid?: string;
  error?: string;
}

/**
 * Call the user and read their OTP code aloud.
 *
 * The OTP is spelled out digit-by-digit with pauses for clarity.
 * Example: "Your verification code is: 4. 8. 2. 7. 1. 9."
 *
 * When to use voice fallback:
 * - User explicitly requests "Call me instead"
 * - SMS delivery fails (after 30s timeout or Twilio error)
 * - Second resend attempt (SMS → SMS → Voice escalation)
 * - User's carrier blocks short-code SMS
 */
export async function sendVoiceOtp(to: string, otp: string): Promise<VoiceResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return { success: false, error: "Twilio voice not configured" };
  }

  // Spell out digits with pauses for clarity
  const spokenOtp = otp.split("").join(". . ");

  // TwiML instructs Twilio what to say on the call
  const twiml = `
    <Response>
      <Say voice="alice" language="en-GB">
        Your verification code is: ${spokenOtp}.
        I repeat: ${spokenOtp}.
        Goodbye.
      </Say>
    </Response>
  `.trim();

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: TWILIO_FROM,
        Twiml: twiml,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`[VOICE] Failed: Twilio ${data.code}: ${data.message}`);
      return { success: false, error: `Twilio ${data.code}: ${data.message}` };
    }

    console.log(`[VOICE] Call initiated — SID: ${data.sid}`);
    return { success: true, callSid: data.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[VOICE] Network error: ${msg}`);
    return { success: false, error: msg };
  }
}
