/**
 * Complete Phone Verification Flow
 *
 * A ready-to-use component that handles the entire OTP journey:
 *
 *   Step 1: Phone input → Send code
 *   Step 2: OTP input → Verify code
 *
 * With resend timer, channel escalation, "Call me instead",
 * error handling, and loading states.
 *
 * Dependencies:
 *   npm install react-phone-number-input
 *
 * Usage:
 *   <VerificationFlow
 *     onVerified={(phone) => router.push("/dashboard")}
 *     sendEndpoint="/api/otp/send"
 *     verifyEndpoint="/api/otp/verify"
 *     resendEndpoint="/api/otp/resend"
 *   />
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { PhoneInput, isValidPhoneNumber } from "./PhoneInput";
import { OtpInput } from "./OtpInput";

// ── Types ───────────────────────────────────────────────────

export interface VerificationFlowProps {
  /** Called after successful verification with the E.164 phone */
  onVerified: (phone: string, data?: Record<string, unknown>) => void;
  /** API endpoint to send OTP (POST, body: { phone, channel }) */
  sendEndpoint?: string;
  /** API endpoint to verify OTP (POST, body: { phone, otp }) */
  verifyEndpoint?: string;
  /** API endpoint to resend OTP (POST, body: { phone, preferredChannel }) */
  resendEndpoint?: string;
  /** Default country for phone input */
  defaultCountry?: "GB" | "US" | "DE" | "FR" | "ES" | "IN" | "AU" | string;
  /** Resend cooldown in seconds (default: 60) */
  resendCooldownSeconds?: number;
  /** Number of SMS resends before showing "Call me" option (default: 1) */
  callFallbackAfter?: number;
  /** App name shown in the UI (default: "your account") */
  appName?: string;
  /** Additional CSS classes */
  className?: string;
}

type Step = "phone" | "otp";

// ── Component ───────────────────────────────────────────────

export function VerificationFlow({
  onVerified,
  sendEndpoint = "/api/otp/send",
  verifyEndpoint = "/api/otp/verify",
  resendEndpoint = "/api/otp/resend",
  defaultCountry = "GB",
  resendCooldownSeconds = 60,
  callFallbackAfter = 1,
  appName = "your account",
  className = "",
}: VerificationFlowProps) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState<string>();
  const [maskedPhone, setMaskedPhone] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [cooldown, setCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);

  // ── Cooldown timer ──
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // ── API helpers ──
  const apiCall = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  };

  // ── Send OTP ──
  const handleSendOtp = async () => {
    if (!phone || !isValidPhoneNumber(phone)) {
      setError("Please enter a valid phone number");
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const data = await apiCall(sendEndpoint, { phone });
      setMaskedPhone(data.maskedPhone || phone);
      setStep("otp");
      setCooldown(resendCooldownSeconds);
      setResendCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  // ── Verify OTP ──
  const handleVerifyOtp = useCallback(
    async (otp: string) => {
      setLoading(true);
      setError(undefined);

      try {
        const data = await apiCall(verifyEndpoint, { phone, otp });
        onVerified(phone!, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed");
        setLoading(false);
      }
    },
    [phone, verifyEndpoint, onVerified]
  );

  // ── Resend OTP ──
  const handleResend = async (preferredChannel?: string) => {
    setLoading(true);
    setError(undefined);

    try {
      const data = await apiCall(resendEndpoint, {
        phone,
        preferredChannel,
      });
      setCooldown(resendCooldownSeconds);
      setResendCount((c) => c + 1);

      // Show channel-specific feedback
      if (data.channelMessage) {
        setError(undefined);
        // Brief success message (auto-clears)
        setError(data.channelMessage);
        setTimeout(() => setError(undefined), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend");
    } finally {
      setLoading(false);
    }
  };

  // ── Change number (go back to step 1) ──
  const handleChangeNumber = () => {
    setStep("phone");
    setError(undefined);
    setCooldown(0);
    setResendCount(0);
  };

  // ── Render ────────────────────────────────────────────────

  if (step === "phone") {
    return (
      <div className={`w-full max-w-sm mx-auto ${className}`}>
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">
            Verify your phone
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            We'll send a verification code to confirm {appName}.
          </p>
        </div>

        <PhoneInput
          value={phone}
          onChange={setPhone}
          defaultCountry={defaultCountry as any}
          label="Phone number"
          error={error}
          disabled={loading}
        />

        <button
          onClick={handleSendOtp}
          disabled={loading || !phone}
          className="
            w-full mt-4 py-2.5 px-4 rounded-lg
            font-medium text-white
            bg-blue-600 hover:bg-blue-700
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          {loading ? "Sending..." : "Send verification code"}
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-sm mx-auto ${className}`}>
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">
          Enter verification code
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Sent to {maskedPhone}
        </p>
      </div>

      <OtpInput
        onComplete={handleVerifyOtp}
        disabled={loading}
        error={error}
      />

      {/* ── Actions ── */}
      <div className="flex flex-col items-center gap-2 mt-6">
        {/* Resend button */}
        <button
          onClick={() => handleResend()}
          disabled={cooldown > 0 || loading}
          className="
            text-sm font-medium
            text-blue-600 hover:text-blue-700
            disabled:text-neutral-400 disabled:cursor-not-allowed
            transition-colors
          "
        >
          {cooldown > 0
            ? `Resend code in ${cooldown}s`
            : "Resend code"}
        </button>

        {/* Call me instead (shows after N resends) */}
        {resendCount >= callFallbackAfter && cooldown === 0 && (
          <button
            onClick={() => handleResend("voice")}
            disabled={loading}
            className="
              text-sm font-medium
              text-neutral-600 hover:text-neutral-800
              transition-colors
            "
          >
            Call me instead
          </button>
        )}

        {/* Change number */}
        <button
          onClick={handleChangeNumber}
          disabled={loading}
          className="
            text-sm text-neutral-500 hover:text-neutral-700
            transition-colors
          "
        >
          Use a different number
        </button>
      </div>
    </div>
  );
}
