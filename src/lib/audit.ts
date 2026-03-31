/**
 * Audit Event Logging
 *
 * Log all OTP-related events for security monitoring, debugging,
 * and compliance. Events are fire-and-forget — never let audit
 * failures break the authentication flow.
 *
 * Events to log:
 * - otp.requested: User requested an OTP
 * - otp.sent: OTP successfully delivered
 * - otp.send_failed: Twilio delivery failure
 * - otp.verified: Successful verification
 * - otp.failed: Wrong code entered
 * - otp.expired: Code expired before verification
 * - otp.locked_out: Max attempts exceeded
 * - otp.rate_limited: Request rate limited
 * - otp.resent: Code resent (track channel escalation)
 * - otp.voice_fallback: Escalated from SMS to voice call
 */

export interface AuditEvent {
  /** Event type (e.g., "otp.verified") */
  event: string;
  /** Masked phone number */
  phone?: string;
  /** Client IP address */
  ip?: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Log an audit event. NEVER throws — failures are logged to console only.
 *
 * In production, pipe these to your observability stack:
 * - Datadog / New Relic / Grafana
 * - PostgreSQL audit_events table
 * - S3/GCS for long-term retention
 */
export async function logAuditEvent(
  event: string,
  details?: {
    phone?: string;
    ip?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const auditEvent: AuditEvent = {
    event,
    phone: details?.phone,
    ip: details?.ip,
    metadata: details?.metadata,
    timestamp: new Date().toISOString(),
  };

  try {
    // ── Option 1: Console (always available) ──
    console.log(`[AUDIT] ${JSON.stringify(auditEvent)}`);

    // ── Option 2: Database (uncomment and adapt) ──
    // await sql`
    //   INSERT INTO audit_events (event, phone, ip, metadata, created_at)
    //   VALUES (${event}, ${details?.phone}, ${details?.ip},
    //           ${JSON.stringify(details?.metadata || {})}, NOW())
    // `;

    // ── Option 3: External service (uncomment and adapt) ──
    // await fetch(process.env.AUDIT_WEBHOOK_URL!, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(auditEvent),
    // });
  } catch (err) {
    // NEVER throw from audit logging — it must not break auth flows
    console.error("[AUDIT] Failed to log event:", err);
  }
}

// ── Convenience functions ───────────────────────────────────────

export const auditOtpRequested = (phone: string, ip: string, channel: string) =>
  logAuditEvent("otp.requested", { phone, ip, metadata: { channel } });

export const auditOtpSent = (phone: string, channel: string, messageSid?: string) =>
  logAuditEvent("otp.sent", { phone, metadata: { channel, messageSid } });

export const auditOtpSendFailed = (phone: string, error: string) =>
  logAuditEvent("otp.send_failed", { phone, metadata: { error } });

export const auditOtpVerified = (phone: string, ip: string) =>
  logAuditEvent("otp.verified", { phone, ip });

export const auditOtpFailed = (phone: string, ip: string, attempts: number) =>
  logAuditEvent("otp.failed", { phone, ip, metadata: { attempts } });

export const auditOtpLockedOut = (phone: string, ip: string) =>
  logAuditEvent("otp.locked_out", { phone, ip });

export const auditOtpRateLimited = (phone: string, ip: string, limitType: string) =>
  logAuditEvent("otp.rate_limited", { phone, ip, metadata: { limitType } });
