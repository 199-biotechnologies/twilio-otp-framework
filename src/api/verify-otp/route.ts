/**
 * POST /api/otp/verify
 *
 * Verify an OTP code submitted by the user.
 *
 * Security measures:
 * - Rate limited per IP
 * - Max 5 attempts per OTP (brute force protection)
 * - OTP deleted atomically on success (single-use)
 * - Timing-safe hash comparison
 * - Audit logging on success and failure
 *
 * Request body:
 * { phone: string, otp: string }
 *
 * Response (success):
 * { success: true, phone: "+447700900000" }
 *
 * Response (failure):
 * { error: "Incorrect code", attemptsRemaining: 3 }
 */
import { NextResponse } from "next/server";
import { verifyOtp } from "../../lib/otp";
import { rateLimit, getClientIp } from "../../lib/rate-limit";
import { normalizePhone, maskPhone } from "../../lib/phone";
import { startTimingGuard } from "../../lib/security";
import {
  auditOtpVerified,
  auditOtpFailed,
  auditOtpLockedOut,
  auditOtpRateLimited,
} from "../../lib/audit";

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  const timer = startTimingGuard(300);

  try {
    const { phone, otp } = (await request.json()) as {
      phone?: string;
      otp?: string;
    };

    // ── Validate input ──
    if (!phone || !otp) {
      await timer.wait();
      return NextResponse.json(
        { error: "Phone and verification code are required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      await timer.wait();
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    const ip = getClientIp(request.headers);

    // ── Rate limit per IP ──
    const ipLimit = await rateLimit(
      `otp:verify:ip:${ip}`,
      { limit: 10, windowSeconds: 600 },
      { authSensitive: true }
    );

    if (!ipLimit.success) {
      await auditOtpRateLimited(maskPhone(normalizedPhone), ip, "verify_ip");
      await timer.wait();
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    // ── Fetch stored OTP ──
    // Adapt this query to your ORM:
    //
    // const [record] = await sql`
    //   SELECT id, otp_hash, expires_at, attempts
    //   FROM sms_otps
    //   WHERE phone = ${normalizedPhone}
    //     AND expires_at > NOW()
    //   ORDER BY created_at DESC
    //   LIMIT 1
    // `;

    // Placeholder — replace with your DB query
    const record = null as {
      id: string;
      otp_hash: string;
      expires_at: Date;
      attempts: number;
    } | null;

    if (!record) {
      await timer.wait();
      return NextResponse.json(
        { error: "Code expired or not found. Please request a new one." },
        { status: 400 }
      );
    }

    // ── Brute force protection ──
    if (record.attempts >= MAX_ATTEMPTS) {
      // Delete the OTP — user must request a new one
      // await sql`DELETE FROM sms_otps WHERE id = ${record.id}`;
      await auditOtpLockedOut(maskPhone(normalizedPhone), ip);
      await timer.wait();
      return NextResponse.json(
        { error: "Too many incorrect attempts. Please request a new code." },
        { status: 429 }
      );
    }

    // ── Verify OTP (timing-safe) ──
    const isValid = verifyOtp(otp.trim(), record.otp_hash);

    if (!isValid) {
      // Increment attempt counter
      // await sql`UPDATE sms_otps SET attempts = attempts + 1 WHERE id = ${record.id}`;
      const remaining = MAX_ATTEMPTS - record.attempts - 1;
      await auditOtpFailed(maskPhone(normalizedPhone), ip, record.attempts + 1);
      await timer.wait();
      return NextResponse.json(
        {
          error: "Incorrect code. Please try again.",
          attemptsRemaining: remaining,
        },
        { status: 400 }
      );
    }

    // ── OTP is valid ──

    // CRITICAL: Atomic delete — prevents replay attacks
    // Use a transaction to ensure OTP is consumed before any side effects
    //
    // await sql.transaction([
    //   sql`DELETE FROM sms_otps WHERE id = ${record.id}`,
    //   sql`UPDATE users SET phone_verified_at = NOW(), last_login = NOW()
    //        WHERE phone = ${normalizedPhone}`,
    // ]);

    await auditOtpVerified(maskPhone(normalizedPhone), ip);

    // ── Create session or return verification proof ──
    // Option A: Create a session directly (for login flow)
    // await createSession(user.id, { ip });

    // Option B: Return a phone claim token (for registration flow)
    // const claimToken = crypto.randomBytes(32).toString("hex");
    // await sql`INSERT INTO phone_verification_claims ...`;

    await timer.wait();
    return NextResponse.json({
      success: true,
      phone: normalizedPhone,
      // Include claim token if registration flow:
      // phoneClaimToken: claimToken,
    });
  } catch (err) {
    console.error("[VERIFY-OTP] Unexpected error:", err);
    await timer.wait();
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
