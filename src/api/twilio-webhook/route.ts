/**
 * POST /api/twilio/webhook
 *
 * Receive Twilio status callbacks for message delivery tracking.
 *
 * Status progression:
 * queued → sending → sent → delivered (success)
 * queued → sending → sent → undelivered (failure)
 * queued → failed (immediate failure)
 *
 * Use this to:
 * - Track delivery rates
 * - Detect problematic numbers (repeated failures)
 * - Trigger voice fallback on SMS failure
 * - Monitor for SMS pumping fraud (unusual volume patterns)
 */
import { NextResponse } from "next/server";
import { validateWebhookRequest } from "../../lib/webhook";

export async function POST(request: Request) {
  // ── Validate Twilio signature ──
  // CRITICAL: Without this, anyone can POST fake delivery statuses
  const isValid = await validateWebhookRequest(request);

  if (!isValid) {
    console.warn("[WEBHOOK] Invalid Twilio signature — rejecting");
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── Parse the status callback ──
  const formData = await request.formData();
  const status = formData.get("MessageStatus") as string;
  const messageSid = formData.get("MessageSid") as string;
  const to = formData.get("To") as string;
  const errorCode = formData.get("ErrorCode") as string | null;
  const errorMessage = formData.get("ErrorMessage") as string | null;

  console.log(`[WEBHOOK] ${messageSid}: ${status}${errorCode ? ` (${errorCode}: ${errorMessage})` : ""}`);

  // ── Handle status updates ──
  switch (status) {
    case "delivered":
      // Message successfully delivered
      // await sql`UPDATE message_log SET status = 'delivered', delivered_at = NOW()
      //           WHERE message_sid = ${messageSid}`;
      break;

    case "undelivered":
    case "failed":
      // Message failed to deliver
      // Log the error for monitoring
      console.error(`[WEBHOOK] Delivery failed for ${messageSid}: ${errorCode} — ${errorMessage}`);

      // Common error codes:
      // 30003: Unreachable destination
      // 30004: Message blocked by carrier
      // 30005: Unknown destination
      // 30006: Landline or unreachable carrier
      // 30007: Carrier violation (content blocked)
      // 30008: Unknown error
      // 21610: Blacklisted (user opted out)

      // Optional: Trigger voice fallback for critical OTPs
      // if (errorCode === "30003" || errorCode === "30006") {
      //   await triggerVoiceFallback(to, messageSid);
      // }

      // await sql`UPDATE message_log SET status = ${status}, error_code = ${errorCode},
      //           error_message = ${errorMessage} WHERE message_sid = ${messageSid}`;
      break;

    case "queued":
    case "sending":
    case "sent":
      // Intermediate states — update tracking
      // await sql`UPDATE message_log SET status = ${status} WHERE message_sid = ${messageSid}`;
      break;
  }

  // Always return 200 — Twilio will retry on non-2xx
  return new NextResponse("OK", { status: 200 });
}
