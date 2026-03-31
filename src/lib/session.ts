/**
 * Session Management (Post-OTP)
 *
 * After OTP verification succeeds, create a secure session.
 * This module provides database-backed sessions with HTTP-only cookies.
 *
 * Why database-backed over JWT?
 * - Instant revocation (delete the row)
 * - No token size limits
 * - Session metadata (IP, device, last activity)
 * - Sliding window expiry
 *
 * When JWT is fine:
 * - Stateless APIs with short-lived tokens
 * - Microservices where DB lookup is expensive
 * - Using NextAuth (handles JWT internally)
 */
import crypto from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "__session";
const SESSION_DURATION_DAYS = Number(process.env.SESSION_DURATION_DAYS) || 14;
const SESSION_REFRESH_THRESHOLD = 0.5; // Refresh when 50% of lifetime consumed

/**
 * Generate a cryptographically random session token.
 * 32 bytes = 256 bits of entropy — sufficient for session IDs.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a new session after successful OTP verification.
 *
 * This function:
 * 1. Generates a random session token
 * 2. Stores it in your database (you implement the DB call)
 * 3. Sets an HTTP-only secure cookie
 *
 * Adapt the DB call to your ORM (Drizzle, Prisma, raw SQL).
 */
export async function createSession(
  userId: string,
  metadata?: { ip?: string; userAgent?: string }
): Promise<string> {
  const sessionId = generateSessionToken();
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  // ── Store a HASH of the token in the database ──
  // The raw token goes in the cookie; only the hash is stored server-side.
  // If the database is compromised, attackers can't use the hashed values
  // to forge session cookies.
  const hashedSessionId = crypto
    .createHash("sha256")
    .update(sessionId)
    .digest("hex");

  // await sql`
  //   INSERT INTO sessions (id, user_id, expires_at, ip, user_agent, created_at)
  //   VALUES (${hashedSessionId}, ${userId}, ${expiresAt.toISOString()},
  //           ${metadata?.ip}, ${metadata?.userAgent}, NOW())
  // `;

  // ── Set HTTP-only cookie ──
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true, // Prevents XSS from reading the cookie
    secure: process.env.NODE_ENV === "production", // HTTPS only in prod
    sameSite: "lax", // CSRF protection (blocks cross-origin POST)
    expires: expiresAt,
    path: "/",
  });

  return sessionId;
}

/**
 * Validate a session and optionally refresh if near expiry.
 *
 * Sliding window: if more than 50% of the session lifetime has passed,
 * extend the expiry. This means active users stay logged in, but
 * abandoned sessions expire on schedule.
 */
export async function validateSession(
  sessionId: string
): Promise<{ valid: boolean; userId?: string; shouldRefresh?: boolean }> {
  // ── Look up session in database (adapt to your ORM) ──
  // const session = await sql`
  //   SELECT user_id, expires_at, created_at
  //   FROM sessions
  //   WHERE id = ${sessionId} AND expires_at > NOW()
  // `;
  //
  // if (!session) return { valid: false };
  //
  // // Check if we should refresh (sliding window)
  // const totalLifetime = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
  // const elapsed = Date.now() - new Date(session.created_at).getTime();
  // const shouldRefresh = elapsed > totalLifetime * SESSION_REFRESH_THRESHOLD;
  //
  // return { valid: true, userId: session.user_id, shouldRefresh };

  // Placeholder — implement with your database
  return { valid: false };
}

/**
 * Destroy a session (logout).
 */
export async function destroySession(sessionId: string): Promise<void> {
  // ── Delete from database ──
  // await sql`DELETE FROM sessions WHERE id = ${sessionId}`;

  // ── Clear cookie ──
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
