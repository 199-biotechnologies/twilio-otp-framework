/**
 * Login With Phone — Dual-Mode Auth Component
 *
 * A polished login box with two modes:
 *   - Email (magic link)
 *   - Phone (OTP)
 *
 * Drop this into your login page. Handles the full flow.
 *
 * Usage:
 *   <LoginWithPhone
 *     onAuthenticated={(user) => router.push("/dashboard")}
 *     modes={["phone", "email"]}
 *   />
 *
 * Props:
 *   - modes: which auth methods to show (default: ["phone", "email"])
 *   - brandName: your app name
 *   - brandLogo: URL or React node for the logo
 *   - defaultCountry: ISO country code for phone input
 *   - onAuthenticated: callback after successful auth
 */
"use client";

import { useState, type ReactNode } from "react";
import { VerificationFlow } from "./VerificationFlow";

// ── Types ───────────────────────────────────────────────────

type AuthMode = "phone" | "email";

export interface LoginWithPhoneProps {
  /** Called after successful authentication */
  onAuthenticated: (result: { phone?: string; email?: string }) => void;
  /** Which auth methods to show */
  modes?: AuthMode[];
  /** Default auth mode */
  defaultMode?: AuthMode;
  /** App name shown in header */
  brandName?: string;
  /** Logo element (URL string or React node) */
  brandLogo?: string | ReactNode;
  /** Default country for phone input */
  defaultCountry?: string;
  /** Magic link API endpoint */
  magicLinkEndpoint?: string;
  /** OTP API endpoints */
  otpEndpoints?: {
    send?: string;
    verify?: string;
    resend?: string;
  };
}

// ── Component ───────────────────────────────────────────────

export function LoginWithPhone({
  onAuthenticated,
  modes = ["phone", "email"],
  defaultMode,
  brandName = "Sign in",
  brandLogo,
  defaultCountry = "GB",
  magicLinkEndpoint = "/api/auth/magic-link",
  otpEndpoints = {},
}: LoginWithPhoneProps) {
  const initialMode = defaultMode || modes[0] || "phone";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const showTabs = modes.length > 1;

  // ── Email magic link flow ──
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const res = await fetch(magicLinkEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send link");
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send link");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Card */}
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-6">
          {brandLogo && (
            <div className="mb-4 flex justify-center">
              {typeof brandLogo === "string" ? (
                <img src={brandLogo} alt="" className="h-10" />
              ) : (
                brandLogo
              )}
            </div>
          )}
          <h1 className="text-2xl font-bold text-neutral-900">
            {brandName}
          </h1>
        </div>

        {/* Mode tabs */}
        {showTabs && (
          <div className="flex border-2 border-neutral-200 rounded-lg mb-6 overflow-hidden">
            {modes.includes("email") && (
              <button
                onClick={() => {
                  setMode("email");
                  setError(undefined);
                }}
                className={`
                  flex-1 py-2 text-sm font-medium transition-colors
                  ${mode === "email"
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-600 hover:bg-neutral-50"
                  }
                `}
              >
                Email
              </button>
            )}
            {modes.includes("phone") && (
              <button
                onClick={() => {
                  setMode("phone");
                  setError(undefined);
                }}
                className={`
                  flex-1 py-2 text-sm font-medium transition-colors
                  ${mode === "phone"
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-600 hover:bg-neutral-50"
                  }
                `}
              >
                Phone
              </button>
            )}
          </div>
        )}

        {/* Phone mode */}
        {mode === "phone" && (
          <VerificationFlow
            onVerified={(phone) => onAuthenticated({ phone })}
            sendEndpoint={otpEndpoints.send}
            verifyEndpoint={otpEndpoints.verify}
            resendEndpoint={otpEndpoints.resend}
            defaultCountry={defaultCountry as any}
            appName={brandName}
          />
        )}

        {/* Email mode */}
        {mode === "email" && !emailSent && (
          <form onSubmit={handleEmailSubmit}>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className="
                w-full px-3 py-2.5 border-2 border-neutral-300 rounded-lg
                text-base bg-white
                focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                disabled:opacity-50 disabled:cursor-not-allowed
                placeholder:text-neutral-400
                transition-colors
              "
            />
            {error && (
              <p className="mt-1.5 text-sm text-red-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email}
              className="
                w-full mt-4 py-2.5 px-4 rounded-lg
                font-medium text-white
                bg-blue-600 hover:bg-blue-700
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </form>
        )}

        {/* Email sent confirmation */}
        {mode === "email" && emailSent && (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-neutral-900 font-medium">Check your email</p>
            <p className="text-sm text-neutral-500 mt-1">
              We sent a login link to {email}
            </p>
            <button
              onClick={() => setEmailSent(false)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
