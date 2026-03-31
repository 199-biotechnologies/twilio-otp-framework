# OTP Verification

## Core Flow

```
User submits code
    │
    ├── Rate limit check (per-IP)
    │
    ├── Fetch stored OTP from DB
    │   └── Not found? → "Code expired or not found"
    │
    ├── Brute force check (attempts >= 5?)
    │   └── Locked out? → Delete OTP, "Too many attempts"
    │
    ├── Hash input with HMAC-SHA256
    │
    ├── Timing-safe comparison
    │   └── Mismatch? → Increment attempts, "Incorrect code"
    │
    └── Match! → Atomic transaction:
        ├── DELETE otp record (single-use)
        ├── UPDATE user.phone_verified_at
        └── Create session OR issue claim token
```

## Two Verification Flows

### Flow A: Login (Phone → Session)

User has an account. OTP replaces password.

```typescript
// 1. Verify OTP
const isValid = verifyOtp(inputCode, storedHash);

// 2. Find user by phone
const user = await sql`SELECT * FROM users WHERE phone = ${phone}`;
if (!user) return error("No account found");

// 3. Atomic: consume OTP + create session
await sql.transaction([
  sql`DELETE FROM sms_otps WHERE id = ${record.id}`,
  sql`UPDATE users SET phone_verified_at = NOW(), last_login = NOW() WHERE id = ${user.id}`,
]);

await createSession(user.id);
```

### Flow B: Registration (Phone → Claim → Account)

User doesn't have an account yet. Need to prove phone ownership during registration.

**Problem:** Between OTP verification and account creation, the client could send any phone number. You need a server-side proof.

**Solution:** Phone Verification Claims

```typescript
// 1. Verify OTP (during registration, before account exists)
const isValid = verifyOtp(inputCode, storedHash);

// 2. Issue a claim token (server-side proof of phone ownership)
const claimToken = crypto.randomBytes(32).toString("hex");
const claimExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

await sql.transaction([
  sql`DELETE FROM sms_otps WHERE id = ${record.id}`,
  sql`DELETE FROM phone_verification_claims WHERE phone = ${phone}`,
  sql`INSERT INTO phone_verification_claims (token, phone, expires_at)
      VALUES (${claimToken}, ${phone}, ${claimExpiry})`,
]);

return { phoneClaimToken: claimToken };

// 3. Client includes claim token in registration request
// POST /api/auth/register { name, email, phoneClaimToken }

// 4. Server validates claim atomically
const [claim] = await sql`
  DELETE FROM phone_verification_claims
  WHERE token = ${phoneClaimToken} AND phone = ${phone} AND expires_at > NOW()
  RETURNING phone
`;

if (!claim) return error("Phone verification expired");

// 5. Create account with verified phone
await sql`INSERT INTO users (name, email, phone, phone_verified_at) ...`;
```

### Flow C: Phone Linking (Add phone to existing account)

User is already logged in, wants to add/change their phone number.

```typescript
// 1. User submits phone → Send OTP
// 2. Verify OTP
// 3. Update user record (requires auth)

const session = await getSession(request);
if (!session) return error("Unauthorized");

await sql.transaction([
  sql`DELETE FROM sms_otps WHERE id = ${record.id}`,
  sql`UPDATE users SET phone = ${phone}, phone_verified_at = NOW()
      WHERE id = ${session.userId}`,
]);
```

**Handle duplicate phones:**
```typescript
try {
  await sql`UPDATE users SET phone = ${phone} WHERE id = ${userId}`;
} catch (err) {
  if (err.code === "23505") { // Unique constraint violation
    return error("This phone number is already linked to another account.");
  }
  throw err;
}
```

## Atomic Operations

**Why atomicity matters:** If you delete the OTP and then the session creation fails, the user has consumed their code with nothing to show for it. Always use transactions.

```typescript
// GOOD: Atomic — either everything succeeds or nothing
await sql.transaction([
  sql`DELETE FROM sms_otps WHERE id = ${record.id}`,
  sql`UPDATE users SET phone_verified_at = NOW() WHERE id = ${user.id}`,
]);

// BAD: Non-atomic — OTP consumed but session may fail
await sql`DELETE FROM sms_otps WHERE id = ${record.id}`;
await createSession(user.id); // If this throws, OTP is already gone
```

## Single-Use Enforcement

OTPs must be consumed exactly once. The atomic DELETE pattern ensures this:

Use a two-step pattern: SELECT to get the hash, then DELETE after verification:

```sql
-- Step 1: Fetch (don't delete yet — code hasn't been verified)
SELECT id, otp_hash, attempts FROM sms_otps
WHERE phone = $1 AND expires_at > NOW()
ORDER BY created_at DESC LIMIT 1;

-- Step 2: After hash comparison succeeds, consume atomically
DELETE FROM sms_otps WHERE id = $1 RETURNING id;
```

The DELETE in step 2 ensures single-use. If two requests verify simultaneously, only one gets the RETURNING result. The other gets zero rows.

**Never DELETE before verifying the code.** A DELETE-then-check pattern would consume valid OTPs before knowing if the submitted code is correct.
