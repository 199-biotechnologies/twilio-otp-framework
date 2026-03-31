# Integration Patterns

## Supabase Auth + Twilio

Supabase has native Twilio integration for phone login.

**Setup:**
1. Dashboard → Authentication → Providers → Phone
2. Enter Twilio Account SID, Auth Token, Messaging Service SID

```typescript
// Send OTP (Supabase + Twilio handle everything)
const { error } = await supabase.auth.signInWithOtp({
  phone: "+447700900000",
});

// Verify OTP
const { data: { session }, error } = await supabase.auth.verifyOtp({
  phone: "+447700900000",
  token: "482719",
  type: "sms",
});

// Update phone (requires re-verification)
const { error } = await supabase.auth.updateUser({
  phone: "+447700900000",
});
```

**Supabase defaults:** 60s between resends, 1-hour OTP expiry, 6-digit PIN.

## NextAuth (Auth.js) + Custom OTP

NextAuth doesn't have a native phone provider. Use a custom Credentials provider:

```typescript
// auth.ts
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const { auth, signIn } = NextAuth({
  providers: [
    CredentialsProvider({
      id: "sms-otp",
      name: "Phone",
      credentials: {
        phone: { type: "text" },
        otp: { type: "text" },
      },
      async authorize(credentials) {
        const { phone, otp } = credentials;

        // Your OTP verification logic
        const normalizedPhone = normalizePhone(phone);
        const record = await getActiveOtp(normalizedPhone);
        if (!record) return null;

        const isValid = verifyOtp(otp, record.otp_hash);
        if (!isValid) {
          await incrementAttempts(record.id);
          return null;
        }

        // Atomic: consume OTP + find/create user
        await consumeOtp(record.id);
        const user = await findOrCreateUserByPhone(normalizedPhone);
        return { id: user.id, phone: normalizedPhone };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
});
```

## better-auth + Twilio

`better-auth` has a dedicated phone plugin with Twilio support:

```typescript
import { betterAuth } from "better-auth";
import { phoneNumber } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        await sendSms(phoneNumber, `Your code: ${code}`);
      },
      verifyOTP: async ({ phoneNumber, code }) => {
        // Or use Twilio Verify API:
        const result = await checkVerification(phoneNumber, code);
        return result.success;
      },
    }),
  ],
});
```

## Stripe + Phone Verification

Use phone verification before high-value Stripe operations:

```typescript
// Before creating a payment intent
const isPhoneVerified = await checkPhoneVerification(user.id);
if (!isPhoneVerified) {
  return { requiresPhoneVerification: true };
}

// Proceed with Stripe
const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000,
  currency: "gbp",
  customer: user.stripeCustomerId,
  metadata: { phoneVerifiedAt: user.phone_verified_at },
});
```

## Twilio Lookup + Stripe Identity

For KYC flows, combine Twilio Lookup Identity Match with Stripe Identity:

```typescript
// Step 1: Verify phone ownership (Twilio)
const verifyResult = await checkVerification(phone, otp);

// Step 2: Check phone matches identity (Twilio Lookup v2)
const lookup = await fetch(
  `https://lookups.twilio.com/v2/PhoneNumbers/${phone}?Fields=identity_match`,
  { headers: { Authorization: `Basic ${auth}` } }
);
// Returns match scores for first_name, last_name, address

// Step 3: Verify identity document (Stripe Identity)
const verificationSession = await stripe.identity.verificationSessions.create({
  type: "document",
  metadata: { phone, twilioIdentityMatchScore: lookup.summary_score },
});
```
