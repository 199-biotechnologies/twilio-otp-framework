/**
 * POST /api/otp/send
 *
 * Send an OTP to a phone number. Supports channel selection (SMS, Voice, WhatsApp).
 *
 * Flow:
 * 1. Validate & normalize phone number
 * 2. Rate limit (per-phone + per-IP)
 * 3. Optionally check phone intelligence (block VoIP/landline)
 * 4. Invalidate any existing OTPs for this phone
 * 5. Generate, hash, and store new OTP
 * 6. Send via selected channel
 * 7. Audit log the event
 *
 * Request body:
 * { phone: string, channel?: "sms" | "voice" | "whatsapp" }
 *
 * Response:
 * { success: true, expiresIn: 300, maskedPhone: "+44 **** 0000" }
 */
import { NextResponse } from "next/server";
import { generateOtp, hashOtp } from "../../lib/otp";
import { sendSms } from "../../lib/sms";
import { sendVoiceOtp } from "../../lib/voice";
import { sendWhatsAppOtp } from "../../lib/whatsapp";
import { rateLimit, getClientIp } from "../../lib/rate-limit";
import { normalizePhone, maskPhone } from "../../lib/phone";
import { startTimingGuard } from "../../lib/security";
import { auditOtpRequested, auditOtpSent, auditOtpSendFailed, auditOtpRateLimited } from "../../lib/audit";

const OTP_TTL_MINUTES = 5;
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Your App";

type Channel = "sms" | "voice" | "whatsapp";

export async function POST(request: Request) {
  // Timing guard: ensure consistent response time (prevents user enumeration)
  const timer = startTimingGuard(500);

  try {
    const { phone, channel = "sms" } = (await request.json()) as {
      phone?: string;
      channel?: Channel;
    };

    // ── 1. Validate phone ──
    if (!phone) {
      await timer.wait();
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      await timer.wait();
      return NextResponse.json(
        { error: "Please enter a valid phone number with country code (e.g. +44 7700 900000)" },
        { status: 400 }
      );
    }

    const ip = getClientIp(request.headers);

    // ── 2. Rate limit ──
    const phoneLimit = await rateLimit(
      `otp:send:${normalizedPhone}`,
      { limit: 3, windowSeconds: 600 }, // 3 per phone per 10 min
      { authSensitive: true }
    );

    if (!phoneLimit.success) {
      await auditOtpRateLimited(maskPhone(normalizedPhone), ip, "phone");
      await timer.wait();
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const ipLimit = await rateLimit(
      `otp:send:ip:${ip}`,
      { limit: 10, windowSeconds: 600 }, // 10 per IP per 10 min
      { authSensitive: true }
    );

    if (!ipLimit.success) {
      await auditOtpRateLimited(maskPhone(normalizedPhone), ip, "ip");
      await timer.wait();
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    // ── 3. Optional: Phone intelligence check ──
    // Uncomment to block VoIP or validate before sending:
    // const lookup = await lookupPhone(normalizedPhone);
    // const block = shouldBlockPhone(lookup, { allowVoip: false });
    // if (block.blocked) {
    //   return NextResponse.json({ error: block.reason }, { status: 400 });
    // }

    await auditOtpRequested(maskPhone(normalizedPhone), ip, channel);

    // ── 4. Invalidate existing OTPs ──
    // User should only have the latest code active
    // await sql`DELETE FROM sms_otps WHERE phone = ${normalizedPhone}`;

    // ── 5. Generate & store OTP ──
    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // await sql`
    //   INSERT INTO sms_otps (phone, otp_hash, expires_at, attempts, channel)
    //   VALUES (${normalizedPhone}, ${hashedOtp}, ${expiresAt.toISOString()}, 0, ${channel})
    // `;

    // ── 6. Send via selected channel ──
    const message = `Your ${APP_NAME} verification code is: ${otp}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes. Do not share it.`;

    let result;
    switch (channel) {
      case "voice":
        result = await sendVoiceOtp(normalizedPhone, otp);
        break;
      case "whatsapp":
        result = await sendWhatsAppOtp(normalizedPhone, otp, APP_NAME);
        break;
      case "sms":
      default:
        result = await sendSms(normalizedPhone, message);
    }

    if (!result.success) {
      // Clean up the OTP if send failed
      // await sql`DELETE FROM sms_otps WHERE phone = ${normalizedPhone}`;
      await auditOtpSendFailed(maskPhone(normalizedPhone), result.error || "Unknown");
      await timer.wait();
      return NextResponse.json(
        { error: "Failed to send verification code. Please check the number and try again." },
        { status: 500 }
      );
    }

    await auditOtpSent(maskPhone(normalizedPhone), channel, result.messageSid);

    // ── 7. Return success ──
    await timer.wait();
    return NextResponse.json({
      success: true,
      expiresIn: OTP_TTL_MINUTES * 60, // seconds
      maskedPhone: maskPhone(normalizedPhone),
      channel,
    });
  } catch (err) {
    console.error("[SEND-OTP] Unexpected error:", err);
    await timer.wait();
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
