/**
 * Phone Input Component
 *
 * International phone input with country flags, auto-formatting,
 * and E.164 output. Drop this into any Next.js project.
 *
 * Dependencies:
 *   npm install react-phone-number-input
 *
 * Usage:
 *   <PhoneInput value={phone} onChange={setPhone} />
 *
 * Output is always E.164: "+447700900000"
 */
"use client";

import { forwardRef, type ComponentProps } from "react";
import BasePhoneInput, {
  isValidPhoneNumber,
  type Country,
} from "react-phone-number-input";
import "react-phone-number-input/style.css";

// ── Types ───────────────────────────────────────────────────

export interface PhoneInputProps {
  /** Current value in E.164 format */
  value: string | undefined;
  /** Called with E.164 string or undefined */
  onChange: (value: string | undefined) => void;
  /** Default country code (ISO 3166-1 alpha-2) */
  defaultCountry?: Country;
  /** Placeholder text */
  placeholder?: string;
  /** Error message to display */
  error?: string;
  /** Label text */
  label?: string;
  /** Disable the input */
  disabled?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
}

// ── Custom inner input (for Tailwind styling) ───────────────

const InnerInput = forwardRef<
  HTMLInputElement,
  ComponentProps<"input">
>(function InnerInput(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className="flex-1 outline-none text-base bg-transparent placeholder:text-neutral-400"
    />
  );
});

// ── Component ───────────────────────────────────────────────

export function PhoneInput({
  value,
  onChange,
  defaultCountry = "GB",
  placeholder = "Phone number",
  error,
  label,
  disabled = false,
  className = "",
}: PhoneInputProps) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-neutral-700 mb-1.5">
          {label}
        </label>
      )}

      <div
        className={`
          flex items-center border-2 rounded-lg px-3 py-2.5 transition-colors
          ${disabled ? "opacity-50 cursor-not-allowed bg-neutral-50" : "bg-white"}
          ${error
            ? "border-red-500 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-100"
            : "border-neutral-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"
          }
        `}
      >
        <BasePhoneInput
          international
          countryCallingCodeEditable={false}
          defaultCountry={defaultCountry}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          inputComponent={InnerInput}
          className="flex items-center gap-2 w-full"
        />
      </div>

      {error && (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

// ── Re-export validation helper ─────────────────────────────

export { isValidPhoneNumber };
