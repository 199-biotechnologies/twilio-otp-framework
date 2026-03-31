/**
 * POST /api/otp/resend
 *
 * Resend OTP with optional channel escalation.
 *
 * Escalation strategy:
 * - 1st send: SMS (default)
 * - 1st resend: SMS again (fresh code)
 * - 2nd resend: Voice call (or WhatsApp if configured)
 *
 * This handles the common UX flow where users don't receive the SMS
 * and need an alternative delivery method.
 *
 * Request body:
 * { phone: string, resendCount?: number, preferredChannel?: "sms" | "voice" | "whatsapp" }
 */
import { NextResponse } from "next/server";
import { generateOtp, hashOtp } from "../../lib/otp";
import { sendSms } from "../../lib/sms";
import { sendVoiceOtp } from "../../lib/voice";
import { sendWhatsAppOtp } from "../../lib/whatsapp";
import { rateLimit, getClientIp } from "../../lib/rate-limit";
import { normalizePhone, maskPhone } from "../../lib/phone";
import { auditOtpRequested, auditOtpSent, auditOtpSendFailed, auditOtpRateLimited } from "../../lib/audit";

const OTP_TTL_MINUTES = 5;
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Your App";

/**
 * Determine the delivery channel based on resend count and user preference.
 *
 * Strategy:
 * - resendCount 0-1: SMS
 * - resendCount 2+: Voice call (user clearly isn't receiving SMS)
 * - User can always override with preferredChannel
 */
function resolveChannel(
  resendCount: number,
  preferredChannel?: string
): "sms" | "voice" | "whatsapp" {
  // User's explicit choice takes priority
  if (preferredChannel === "voice" || preferredChannel === "whatsapp") {
    return preferredChannel;
  }

  // Auto-escalation: after 2 failed SMS attempts, try voice
  if (resendCount >= 2) {
    return "voice";
  }

  return "sms";
}

export async function POST(request: Request) {
  try {
    const { phone, resendCount = 0, preferredChannel } = (await request.json()) as {
      phone?: string;
      resendCount?: number;
      preferredChannel?: string;
    };

    if (!phone) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    const ip = getClientIp(request.headers);

    // ── Rate limit resends more strictly ──
    const limit = await rateLimit(
      `otp:resend:${normalizedPhone}`,
      { limit: 5, windowSeconds: 1800 }, // 5 resends per phone per 30 min
      { authSensitive: true }
    );

    if (!limit.success) {
      await auditOtpRateLimited(maskPhone(normalizedPhone), ip, "resend");
      return NextResponse.json(
        { error: "Too many resend attempts. Please wait before trying again." },
        { status: 429 }
      );
    }

    // ── Resolve channel ──
    const channel = resolveChannel(resendCount, preferredChannel);
    await auditOtpRequested(maskPhone(normalizedPhone), ip, `resend:${channel}`);

    // ── Invalidate existing OTPs ──
    // await sql`DELETE FROM sms_otps WHERE phone = ${normalizedPhone}`;

    // ── Generate & store new OTP ──
    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // await sql`
    //   INSERT INTO sms_otps (phone, otp_hash, expires_at, attempts, channel)
    //   VALUES (${normalizedPhone}, ${hashedOtp}, ${expiresAt.toISOString()}, 0, ${channel})
    // `;

    // ── Send via resolved channel ──
    const message = `Your ${APP_NAME} verification code is: ${otp}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes.`;

    let result;
    switch (channel) {
      case "voice":
        result = await sendVoiceOtp(normalizedPhone, otp);
        break;
      case "whatsapp":
        result = await sendWhatsAppOtp(normalizedPhone, otp, APP_NAME);
        break;
      default:
        result = await sendSms(normalizedPhone, message);
    }

    if (!result.success) {
      // await sql`DELETE FROM sms_otps WHERE phone = ${normalizedPhone}`;
      await auditOtpSendFailed(maskPhone(normalizedPhone), result.error || "Unknown");
      return NextResponse.json(
        { error: "Failed to send code. Please try again." },
        { status: 500 }
      );
    }

    await auditOtpSent(maskPhone(normalizedPhone), channel, result.messageSid);

    return NextResponse.json({
      success: true,
      channel,
      expiresIn: OTP_TTL_MINUTES * 60,
      maskedPhone: maskPhone(normalizedPhone),
      // Tell the frontend what channel was used (for UI messaging)
      channelMessage:
        channel === "voice"
          ? "You will receive a phone call with your code."
          : channel === "whatsapp"
            ? "Check your WhatsApp for the code."
            : "A new code has been sent via SMS.",
    });
  } catch (err) {
    console.error("[RESEND-OTP] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
