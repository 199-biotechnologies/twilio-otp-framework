# Monitoring & Audit

## Audit Events

Log every OTP-related event for security investigation and compliance.

| Event | When | Key Data |
|-------|------|----------|
| `otp.requested` | User requests OTP | masked phone, IP, channel |
| `otp.sent` | OTP delivered | masked phone, channel, message SID |
| `otp.send_failed` | Delivery failed | masked phone, error |
| `otp.verified` | Correct code entered | masked phone, IP |
| `otp.failed` | Wrong code entered | masked phone, IP, attempt count |
| `otp.expired` | Code expired unused | masked phone |
| `otp.locked_out` | Max attempts exceeded | masked phone, IP |
| `otp.rate_limited` | Request rate limited | masked phone, IP, limit type |
| `otp.resent` | Code resent | masked phone, channel |
| `otp.voice_fallback` | Escalated to voice | masked phone |

## Implementation

```typescript
export async function logAuditEvent(event: string, details?: {...}): Promise<void> {
  try {
    console.log(`[AUDIT] ${JSON.stringify({ event, ...details, timestamp: new Date().toISOString() })}`);
    // Also write to DB, Datadog, etc.
  } catch (err) {
    // NEVER throw — audit must not break auth flows
    console.error("[AUDIT] Failed:", err);
  }
}
```

**Critical rule:** Audit logging is fire-and-forget. Never let a logging failure block authentication.

## Key Metrics to Monitor

### Conversion Rate

```
Conversion = verified OTPs / sent OTPs
```

- **Healthy:** 60-80%
- **Alert at:** < 30% (possible SMS pumping)
- **Alert at:** < 10% (active attack or delivery failure)

### Delivery Rate

```
Delivery = delivered messages / sent messages
```

Track via Twilio webhook status callbacks.

### Rate Limit Hits

Monitor `otp.rate_limited` events. Spikes indicate:
- Brute force attack in progress
- SMS pumping attempt
- Legitimate UX problem (users can't get codes)

### Geographic Anomalies

Monitor OTP requests by country (from phone number prefix). Alert on:
- Sudden traffic from countries you don't serve
- Unusual volume patterns (SMS pumping signature)

## Alerting Recommendations

| Alert | Condition | Urgency |
|-------|-----------|---------|
| Low conversion | < 30% over 1 hour | High |
| SMS pumping | > 100 sends to same country prefix in 10 min | Critical |
| Brute force | > 50 `otp.failed` from same IP in 10 min | High |
| Delivery failure | Delivery rate < 50% over 30 min | Medium |
| Rate limiter down | Redis unavailable, fail-closed active | Critical |

## Data Retention

| Data | Retention | Reason |
|------|-----------|--------|
| OTP records | Delete on expiry/use | No reason to keep |
| Audit events | 90 days | Security investigation window |
| Message log | 30 days | Delivery tracking |
| Sessions | Delete on expiry | Clean up |

Run periodic cleanup:
```sql
DELETE FROM sms_otps WHERE expires_at < NOW();
DELETE FROM audit_events WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM message_log WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM sessions WHERE expires_at < NOW();
```
