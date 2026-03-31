/**
 * OTP Input Component
 *
 * 6-digit verification code input with:
 * - Auto-advance between fields
 * - Paste support (paste "482719" and all fields fill)
 * - Arrow key navigation
 * - Backspace moves to previous field
 * - autocomplete="one-time-code" for browser auto-fill from SMS
 * - Mobile-friendly with inputMode="numeric"
 *
 * Zero dependencies — pure React.
 *
 * Usage:
 *   <OtpInput onComplete={(code) => verifyOtp(code)} />
 */
"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ClipboardEvent,
  type ChangeEvent,
} from "react";

// ── Types ───────────────────────────────────────────────────

export interface OtpInputProps {
  /** Number of digits (default: 6) */
  length?: number;
  /** Called when all digits are entered */
  onComplete: (otp: string) => void;
  /** Disable all inputs */
  disabled?: boolean;
  /** Error message to display */
  error?: string;
  /** Auto-focus first input on mount */
  autoFocus?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
}

// ── Component ───────────────────────────────────────────────

export function OtpInput({
  length = 6,
  onComplete,
  disabled = false,
  error,
  autoFocus = true,
  className = "",
}: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first input
  useEffect(() => {
    if (autoFocus && !disabled) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  // Auto-submit when all digits are filled
  useEffect(() => {
    const code = digits.join("");
    if (code.length === length && digits.every((d) => d !== "")) {
      onComplete(code);
    }
  }, [digits, length, onComplete]);

  const focusInput = (index: number) => {
    const clamped = Math.max(0, Math.min(index, length - 1));
    inputRefs.current[clamped]?.focus();
  };

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!/^\d*$/.test(value)) return; // Only digits

    const newDigits = [...digits];
    newDigits[index] = value.slice(-1); // Take last character
    setDigits(newDigits);

    // Auto-advance
    if (value && index < length - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "Backspace":
        if (!digits[index] && index > 0) {
          // Empty field: move back and clear previous
          const newDigits = [...digits];
          newDigits[index - 1] = "";
          setDigits(newDigits);
          focusInput(index - 1);
        } else {
          // Clear current field
          const newDigits = [...digits];
          newDigits[index] = "";
          setDigits(newDigits);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusInput(index - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        focusInput(index + 1);
        break;
      case "Delete":
        const newDigits = [...digits];
        newDigits[index] = "";
        setDigits(newDigits);
        break;
    }
  };

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, length);
      if (!pasted) return;

      const newDigits = Array(length).fill("");
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);
      focusInput(Math.min(pasted.length, length) - 1);
    },
    [length]
  );

  /** Reset all digits (e.g., after a failed verification) */
  const reset = useCallback(() => {
    setDigits(Array(length).fill(""));
    focusInput(0);
  }, [length]);

  return (
    <div className={className}>
      <div
        className="flex gap-2 sm:gap-3 justify-center"
        role="group"
        aria-label="Verification code"
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            // autocomplete="one-time-code" on the first input enables
            // browser auto-fill from incoming SMS (Safari, Chrome)
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            onFocus={(e) => e.target.select()}
            disabled={disabled}
            aria-label={`Digit ${i + 1} of ${length}`}
            className={`
              w-11 h-13 sm:w-12 sm:h-14
              text-center text-2xl font-mono
              border-2 rounded-lg
              transition-colors
              focus:outline-none
              ${disabled ? "opacity-50 cursor-not-allowed bg-neutral-50" : "bg-white"}
              ${error
                ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                : digit
                  ? "border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  : "border-neutral-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              }
            `}
          />
        ))}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}
