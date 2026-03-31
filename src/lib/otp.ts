/**
 * OTP Generation & Hashing
 *
 * Generates cryptographically random 6-digit codes and hashes them
 * with HMAC-SHA256 before storage. Never store OTPs in plaintext.
 */
import crypto from "crypto";

const OTP_HMAC_SECRET = process.env.OTP_HMAC_SECRET;

if (!OTP_HMAC_SECRET) {
  throw new Error("OTP_HMAC_SECRET environment variable is required");
}

/** Generate a cryptographically random 6-digit OTP */
export function generateOtp(): string {
  // crypto.randomInt is CSPRNG — do NOT use Math.random()
  return crypto.randomInt(100_000, 999_999).toString();
}

/**
 * Hash an OTP using HMAC-SHA256 with a server secret.
 *
 * Why HMAC and not plain SHA256?
 * - Plain SHA256 of a 6-digit number is trivially brute-forced (1M possibilities)
 * - HMAC requires the secret key, so even with DB access, an attacker
 *   cannot reverse the hash without also compromising the server secret
 */
export function hashOtp(otp: string): string {
  return crypto
    .createHmac("sha256", OTP_HMAC_SECRET!)
    .update(otp.trim())
    .digest("hex");
}

/**
 * Verify an OTP against a stored hash using timing-safe comparison.
 *
 * Always use this instead of === to prevent timing side-channels.
 */
export function verifyOtp(inputOtp: string, storedHash: string): boolean {
  const inputHash = hashOtp(inputOtp);
  return timingSafeEqual(inputHash, storedHash);
}

/** Timing-safe string comparison to prevent timing attacks */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
