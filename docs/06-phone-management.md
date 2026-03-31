# Phone Number Management

## E.164 Format

All phone numbers MUST be stored and processed in E.164 format.

```
Format: +[country code][subscriber number]
Example: +447700900000 (UK), +14155552671 (US), +918527654321 (India)
Max length: 15 digits (including country code, excluding +)
```

## Normalization

Use `libphonenumber-js` for parsing (lighter than Google's libphonenumber):

```typescript
import { parsePhoneNumberFromString } from "libphonenumber-js";

function normalizePhone(phone: string, defaultCountry = "GB"): string | null {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.format("E.164");
}

// "07700 900000"          → "+447700900000"
// "+1 (415) 555-2671"    → "+14155552671"
// "00442071234567"        → "+442071234567"
```

## Phone Linking Patterns

### Pattern 1: Phone as Login (Primary Auth)

Phone number is the account identifier. No email needed.

```sql
CREATE TABLE users (
  id    UUID PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL, -- E.164
  phone_verified_at TIMESTAMPTZ NOT NULL
);
```

### Pattern 2: Phone as Secondary (Added to Existing Account)

Email is primary, phone is optional for 2FA or additional login.

```sql
CREATE TABLE users (
  id    UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE,           -- Optional, E.164
  phone_verified_at TIMESTAMPTZ       -- NULL if not verified
);
```

### Pattern 3: Dual-Identifier (Either Works)

Users can log in with email OR phone.

```sql
CREATE TABLE users (
  id    UUID PRIMARY KEY,
  email VARCHAR(255),
  phone VARCHAR(20),
  -- At least one must be set:
  CONSTRAINT has_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Partial unique indexes (only active accounts)
CREATE UNIQUE INDEX idx_email_active ON users (email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_phone_active ON users (phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
```

## Duplicate Phone Protection

```typescript
try {
  await sql`UPDATE users SET phone = ${phone} WHERE id = ${userId}`;
} catch (err) {
  if (err.code === "23505") { // PostgreSQL unique violation
    throw new Error("This phone number is already linked to another account.");
  }
  throw err;
}
```

## Phone Verification Claims

Server-side proof of phone ownership for registration flows.

```
User verifies phone via OTP
    │
    ├── Server creates claim: { token, phone, expires_at }
    │
    ├── Returns claim token to client
    │
    ├── Client submits registration with claim token
    │
    └── Server validates & consumes claim atomically
```

This prevents the client from claiming arbitrary phone numbers during registration.

## Masking for Display

```typescript
function maskPhone(phone: string): string {
  if (phone.length < 8) return "****";
  return phone.slice(0, 4) + " **** " + phone.slice(-4);
}

// "+447700900000" → "+447 **** 0000"
```

Use masking in:
- "Code sent to +447 **** 0000"
- Audit logs
- Error messages
- Admin dashboards (unless full number is needed)

## Country Detection

```typescript
import { parsePhoneNumberFromString } from "libphonenumber-js";

const parsed = parsePhoneNumberFromString("+447700900000");
parsed.country; // "GB"
parsed.countryCallingCode; // "44"
```

Use for:
- Auto-selecting the right Twilio sender
- Applying country-specific rate limits
- Choosing Alpha Sender vs number
- Geo-restriction checks
