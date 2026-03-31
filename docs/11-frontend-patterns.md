# Frontend Patterns

## Phone Input Component

**Recommended: `react-phone-number-input`** (968K weekly downloads, E.164 output)

```bash
npm install react-phone-number-input
```

```tsx
"use client";
import { useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

interface PhoneStepProps {
  onSubmit: (phone: string) => void;
  loading?: boolean;
}

export function PhoneStep({ onSubmit, loading }: PhoneStepProps) {
  const [phone, setPhone] = useState<string>();
  const [error, setError] = useState<string>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !isValidPhoneNumber(phone)) {
      setError("Please enter a valid phone number");
      return;
    }
    setError(undefined);
    onSubmit(phone); // Already in E.164 format
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="phone">Phone number</label>
      <PhoneInput
        id="phone"
        defaultCountry="GB"
        international
        countryCallingCodeEditable={false}
        value={phone}
        onChange={setPhone}
        className="phone-input"
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={loading || !phone}>
        {loading ? "Sending..." : "Send verification code"}
      </button>
    </form>
  );
}
```

**Custom styling (Tailwind):**

```css
/* Override react-phone-number-input defaults */
.phone-input {
  @apply flex items-center border-2 border-neutral-300 rounded-lg px-3 py-2
         focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200;
}

.phone-input .PhoneInputCountry {
  @apply mr-2;
}

.phone-input .PhoneInputInput {
  @apply flex-1 outline-none text-lg bg-transparent;
}
```

## OTP Input Component

A 6-digit input with auto-advance, paste support, and keyboard navigation:

```tsx
"use client";
import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";

interface OtpInputProps {
  length?: number;
  onComplete: (otp: string) => void;
  disabled?: boolean;
}

export function OtpInput({ length = 6, onComplete, disabled }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-submit when all digits filled
  useEffect(() => {
    const code = digits.join("");
    if (code.length === length && digits.every(d => d !== "")) {
      onComplete(code);
    }
  }, [digits, length, onComplete]);

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus();
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits

    const newDigits = [...digits];
    newDigits[index] = value.slice(-1); // Take last digit
    setDigits(newDigits);

    // Auto-advance to next input
    if (value && index < length - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      // Move back on empty backspace
      focusInput(index - 1);
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
    } else if (e.key === "ArrowLeft" && index > 0) {
      focusInput(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      focusInput(index + 1);
    }
  };

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
      if (pasted.length === 0) return;

      const newDigits = [...digits];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);

      // Focus last filled input
      focusInput(Math.min(pasted.length, length) - 1);
    },
    [digits, length]
  );

  return (
    <div className="flex gap-2 justify-center" role="group" aria-label="Verification code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          disabled={disabled}
          className="w-12 h-14 text-center text-2xl font-mono border-2 border-neutral-300
                     rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                     disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
```

**Key features:**
- `inputMode="numeric"` — shows number pad on mobile
- `autoComplete="one-time-code"` — browser auto-fills from SMS on first input
- Paste support — user can paste "482719" and all fields fill
- Arrow key navigation
- Backspace moves to previous field
- Auto-submit on completion

## HTML `autocomplete` Attribute

Add `autocomplete="one-time-code"` to your OTP input. This enables:
- **Safari/iOS:** Auto-fills from incoming SMS
- **Chrome/Android:** Shows OTP auto-fill suggestion
- **Desktop browsers:** Auto-fills from phone sync

```html
<input type="text" inputMode="numeric" autoComplete="one-time-code" />
```

## Full Verification Flow

```tsx
export function VerificationFlow() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);

  // Send OTP
  const sendOtp = async (phoneNumber: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhone(phoneNumber);
      setStep("otp");
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const verifyOtp = async (otp: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Success — redirect or callback
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  // Resend with channel escalation
  const resend = async () => {
    setResendCount(c => c + 1);
    setResendCooldown(60);
    await fetch("/api/otp/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, resendCount: resendCount + 1 }),
    });
  };

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  if (step === "phone") {
    return <PhoneStep onSubmit={sendOtp} loading={loading} />;
  }

  return (
    <div>
      <p>Enter the code sent to {maskPhone(phone)}</p>
      <OtpInput onComplete={verifyOtp} disabled={loading} />
      {error && <p className="error">{error}</p>}

      <div className="flex gap-4 mt-4">
        <button disabled={resendCooldown > 0} onClick={resend}>
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
        </button>
        <button onClick={() => setStep("phone")}>
          Change number
        </button>
        {resendCount >= 1 && (
          <button onClick={() => {
            fetch("/api/otp/resend", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone, preferredChannel: "voice" }),
            });
            setResendCooldown(60);
          }}>
            Call me instead
          </button>
        )}
      </div>
    </div>
  );
}
```
