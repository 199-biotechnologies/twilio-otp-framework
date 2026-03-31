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
import { validateAndParseWebhook } from "../../lib/webhook";

export async function POST(request: Request) {
  // ── Validate Twilio signature + parse body in one step ──
  // validateAndParseWebhook consumes request.formData() once and
  // returns the parsed params, avoiding the double-read crash.
  const result = await validateAndParseWebhook(request);

  if (!result) {
    console.warn("[WEBHOOK] Invalid Twilio signature — rejecting");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { params } = result;
  const status = params.MessageStatus;
  const messageSid = params.MessageSid;
  const to = params.To;
  const errorCode = params.ErrorCode;
  const errorMessage = params.ErrorMessage;

  console.log(`[WEBHOOK] ${messageSid}: ${status}${errorCode ? ` (${errorCode}: ${errorMessage})` : ""}`);

  // ── Handle status updates ──
  // Wrap in try/catch — always return 200 to prevent Twilio retries
  try {
    switch (status) {
      case "delivered":
        // Message successfully delivered
        // await sql`UPDATE message_log SET status = 'delivered', delivered_at = NOW()
        //           WHERE message_sid = ${messageSid}`;
        break;

      case "undelivered":
      case "failed":
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
  } catch (err) {
    // Never let processing errors cause a non-200 — Twilio will retry
    console.error("[WEBHOOK] Processing error:", err);
  }

  return new NextResponse("OK", { status: 200 });
}
