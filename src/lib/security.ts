/**
 * Security Utilities
 *
 * Helpers for common security concerns in OTP systems:
 * - Timing attack prevention
 * - User enumeration prevention
 * - Request origin validation
 * - Phone intelligence (Twilio Lookup)
 */
import crypto from "crypto";

// ── Timing Attack Prevention ────────────────────────────────────

/**
 * Enforce a minimum response time to prevent timing side-channels.
 *
 * Problem: If "user not found" returns in 2ms but "wrong password"
 * returns in 50ms, attackers can enumerate valid users.
 *
 * Solution: Pad all responses to a minimum duration.
 *
 * Usage:
 * ```ts
 * const timer = startTimingGuard(500); // 500ms minimum
 * // ... do work ...
 * await timer.wait(); // Ensures at least 500ms have passed
 * return response;
 * ```
 */
export function startTimingGuard(minMs: number = 500) {
  const start = Date.now();
  return {
    async wait() {
      const elapsed = Date.now() - start;
      if (elapsed < minMs) {
        // Add small jitter to avoid exact timing fingerprints
        const jitter = Math.random() * 100;
        await new Promise((r) => setTimeout(r, minMs - elapsed + jitter));
      }
    },
  };
}

// ── User Enumeration Prevention ─────────────────────────────────

/**
 * Return identical responses for "user exists" and "user not found" paths.
 *
 * Both paths should:
 * 1. Take the same amount of time (use startTimingGuard)
 * 2. Return the same HTTP status
 * 3. Return the same response body
 *
 * Example response that prevents enumeration:
 * { success: true, message: "If an account exists, a code has been sent." }
 *
 * BAD (reveals user existence):
 * { error: "No account found for this phone number" } // 404
 */
export const ENUMERATION_SAFE_RESPONSE = {
  success: true,
  message: "If this number is registered, you will receive a code shortly.",
} as const;

// ── Request Origin Validation ───────────────────────────────────

/**
 * Validate that a request came from an allowed origin.
 *
 * This is a defense-in-depth measure alongside SameSite cookies.
 * Useful for admin routes or sensitive API endpoints.
 */
export function validateRequestOrigin(
  request: Request,
  allowedHosts?: string[]
): boolean {
  // Skip for safe methods
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const hosts = allowedHosts || getAllowedHosts();
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  const sourceHost = extractHost(origin) || extractHost(referer);
  if (!sourceHost) return false;

  return hosts.includes(sourceHost);
}

function getAllowedHosts(): string[] {
  const hosts: string[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_URL;
  if (baseUrl) {
    const host = extractHost(baseUrl);
    if (host) hosts.push(host);
  }
  if (process.env.NODE_ENV !== "production") {
    hosts.push("localhost");
  }
  return hosts;
}

function extractHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// ── Twilio Lookup (Phone Intelligence) ──────────────────────────

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();

export interface PhoneLookupResult {
  valid: boolean;
  callingCountryCode?: string;
  countryCode?: string;
  carrier?: {
    name: string;
    type: "landline" | "mobile" | "voip" | string;
  };
  lineType?: string;
  error?: string;
}

/**
 * Look up phone number details using Twilio Lookup API v2.
 *
 * Use cases:
 * - Block VoIP numbers (burner phones) from registration
 * - Detect landlines (can't receive SMS — offer voice call)
 * - Geo-restrict (block numbers from certain countries)
 * - Validate before spending money on SMS delivery
 *
 * Cost: $0.005 per lookup (carrier info) or $0.01 (line type)
 *
 * IMPORTANT: Don't block all VoIP — many legitimate users have VoIP
 * numbers (Google Voice, work phones). Consider risk tolerance.
 */
export async function lookupPhone(phone: string): Promise<PhoneLookupResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return { valid: false, error: "Twilio not configured" };
  }

  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=line_type_intelligence`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    const data = await res.json();

    if (!res.ok) {
      return { valid: false, error: data.message };
    }

    return {
      valid: data.valid,
      callingCountryCode: data.calling_country_code,
      countryCode: data.country_code,
      lineType: data.line_type_intelligence?.type,
      carrier: data.line_type_intelligence?.carrier
        ? {
            name: data.line_type_intelligence.carrier.name,
            type: data.line_type_intelligence.carrier.type,
          }
        : undefined,
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Lookup failed" };
  }
}

/**
 * Check if a phone number should be blocked based on your policy.
 *
 * Customize this based on your risk tolerance:
 */
export function shouldBlockPhone(
  lookup: PhoneLookupResult,
  policy: {
    allowVoip?: boolean;
    allowLandline?: boolean;
    allowedCountries?: string[];
    blockedCountries?: string[];
  } = {}
): { blocked: boolean; reason?: string } {
  const {
    allowVoip = true,
    allowLandline = false,
    allowedCountries,
    blockedCountries,
  } = policy;

  if (!lookup.valid) {
    return { blocked: true, reason: "Invalid phone number" };
  }

  // Twilio Lookup v2 returns granular VoIP types:
  // "fixedVoip" (office phones), "nonFixedVoip" (burner phones like Google Voice)
  const voipTypes = ["voip", "fixedVoip", "nonFixedVoip"];
  if (!allowVoip && voipTypes.includes(lookup.lineType || "")) {
    return { blocked: true, reason: "VoIP numbers not allowed" };
  }

  if (!allowLandline && lookup.lineType === "landline") {
    return { blocked: true, reason: "Landline numbers cannot receive SMS" };
  }

  if (allowedCountries && lookup.countryCode) {
    if (!allowedCountries.includes(lookup.countryCode)) {
      return { blocked: true, reason: `Country ${lookup.countryCode} not supported` };
    }
  }

  if (blockedCountries && lookup.countryCode) {
    if (blockedCountries.includes(lookup.countryCode)) {
      return { blocked: true, reason: `Country ${lookup.countryCode} blocked` };
    }
  }

  return { blocked: false };
}
