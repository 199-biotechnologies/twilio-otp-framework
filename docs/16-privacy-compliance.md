# Privacy & Compliance

## Phone Numbers as PII

Phone numbers are personally identifiable information (PII) under GDPR, CCPA, and most privacy regulations. This has concrete implications for your OTP system.

## GDPR Considerations

### Lawful Basis

You need a lawful basis to process phone numbers. For OTP authentication:

| Basis | When to Use |
|-------|-------------|
| **Legitimate interest** | Phone is one of several login options |
| **Contract performance** | Phone auth is required for the service |
| **Consent** | Phone is optional and user explicitly opts in |

Document your basis. If relying on legitimate interest, perform and document a balancing test.

### Data Minimization

- Only collect the phone number, nothing more
- Don't use phone numbers for marketing unless separately consented
- Don't share phone numbers with third parties beyond Twilio (the processor)

### Retention & Deletion

| Data | Retention | Justification |
|------|-----------|---------------|
| User phone number | Until account deletion | Required for service |
| OTP records | Delete on use or expiry (5 min) | No reason to keep |
| Phone verification claims | Delete on use or expiry (10 min) | Temporary proof |
| Audit logs (with masked phone) | 90 days | Security investigation |
| Message delivery log | 30 days | Delivery monitoring |

**Implement automated cleanup:**
```sql
-- Run as a scheduled job
DELETE FROM sms_otps WHERE expires_at < NOW();
DELETE FROM phone_verification_claims WHERE expires_at < NOW();
DELETE FROM audit_events WHERE created_at < NOW() - INTERVAL '90 days';
```

### Data Subject Rights

Support these for phone data:

| Right | Implementation |
|-------|---------------|
| **Access** | Return the phone number on file |
| **Rectification** | Allow phone number change (with re-verification) |
| **Erasure** | Delete phone + all related OTP/audit records |
| **Portability** | Export phone number in machine-readable format |

### Twilio as Data Processor

Twilio acts as a data processor. You need:
- A Data Processing Agreement (DPA) with Twilio — available at twilio.com/legal/data-protection-addendum
- To configure Twilio's data retention settings for your account
- To be aware that Twilio stores message content for 400 days by default (configurable)

## Encryption

### At Rest

- Phone numbers in PostgreSQL: use column-level encryption if your compliance regime requires it
- Consider `pgcrypto` for transparent encryption:

```sql
-- Encrypt on insert
INSERT INTO users (phone_encrypted)
VALUES (pgp_sym_encrypt('+447700900000', 'encryption_key'));

-- Decrypt on read
SELECT pgp_sym_decrypt(phone_encrypted, 'encryption_key') AS phone
FROM users WHERE id = $1;
```

### In Transit

- All Twilio API calls use HTTPS (enforced by Twilio)
- Your API endpoints should require HTTPS in production
- Session cookies use the `secure` flag

### In Logs

- Always mask phone numbers in application logs
- Never log OTP codes (even hashed)
- Audit events store masked phones only

## Regional Considerations

| Region | Key Requirement |
|--------|----------------|
| **EU (GDPR)** | Lawful basis, DPA with Twilio, right to erasure |
| **US (CCPA/CPRA)** | Notice at collection, opt-out of sale (if applicable) |
| **UK (UK GDPR)** | Same as EU GDPR post-Brexit, with ICO as authority |
| **India (DPDPA)** | Consent-based, data localization requirements |
| **Brazil (LGPD)** | Similar to GDPR, legitimate interest or consent |

## Privacy Policy

Your privacy policy should mention:
- That you collect phone numbers for authentication
- That Twilio processes messages as a third-party provider
- Your retention periods for phone-related data
- How users can request deletion of their phone data
