-- ============================================================
-- Twilio OTP Framework — PostgreSQL Schema
-- ============================================================
-- Run this to set up all tables needed for the OTP system.
-- Adapt column types and constraints to your specific needs.
-- ============================================================

-- ── OTP Storage ─────────────────────────────────────────────
-- Stores hashed OTPs with expiry and attempt tracking.
-- Each phone number can have only one active OTP at a time.

CREATE TABLE IF NOT EXISTS sms_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(20) NOT NULL,            -- E.164 format
  otp_hash    VARCHAR(64) NOT NULL,            -- HMAC-SHA256 hash
  channel     VARCHAR(10) DEFAULT 'sms',       -- sms, voice, whatsapp
  attempts    INTEGER DEFAULT 0,               -- Failed verification attempts
  expires_at  TIMESTAMPTZ NOT NULL,            -- When this OTP expires
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Composite index for the most common query: find active OTP by phone
CREATE INDEX idx_sms_otps_phone_active ON sms_otps (phone, expires_at DESC);
-- Cleanup: find expired OTPs for periodic purging
CREATE INDEX idx_sms_otps_expires ON sms_otps (expires_at);
-- Enforce valid values
ALTER TABLE sms_otps ADD CONSTRAINT chk_channel
  CHECK (channel IN ('sms', 'voice', 'whatsapp'));
ALTER TABLE sms_otps ADD CONSTRAINT chk_attempts
  CHECK (attempts >= 0 AND attempts <= 10);


-- ── Phone Verification Claims ───────────────────────────────
-- Server-side proof of phone ownership for registration flows.
--
-- Problem this solves:
-- During registration, you verify a phone via OTP, but the user
-- hasn't created an account yet. You need a secure token that
-- proves "this phone was verified" that can't be forged by the client.
--
-- Flow:
-- 1. User verifies phone via OTP
-- 2. Server creates a claim token (crypto.randomBytes(32))
-- 3. Client includes claim token in registration request
-- 4. Server validates & consumes the claim atomically

CREATE TABLE IF NOT EXISTS phone_verification_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       VARCHAR(64) UNIQUE NOT NULL,     -- Random claim token
  phone       VARCHAR(20) NOT NULL,            -- Verified phone (E.164)
  expires_at  TIMESTAMPTZ NOT NULL,            -- 10 min TTL
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pvc_token ON phone_verification_claims (token);
CREATE INDEX idx_pvc_phone ON phone_verification_claims (phone);


-- ── Users ───────────────────────────────────────────────────
-- Minimal user table showing phone linking pattern.
-- Extend with your application-specific columns.

CREATE TABLE IF NOT EXISTS users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   VARCHAR(255),         -- Uniqueness via partial index below
  phone                   VARCHAR(20),           -- E.164 format; uniqueness via partial index
  phone_verified_at       TIMESTAMPTZ,         -- When phone was last verified
  email_verified          BOOLEAN DEFAULT false,
  last_login              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ          -- Soft delete
);

-- Fast lookup by phone (for OTP login)
CREATE INDEX idx_users_phone ON users (phone) WHERE phone IS NOT NULL;
-- Prevent re-registration of soft-deleted accounts
CREATE UNIQUE INDEX idx_users_phone_active ON users (phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_email_active ON users (email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;


-- ── Sessions ────────────────────────────────────────────────
-- Database-backed sessions for instant revocation and metadata.

CREATE TABLE IF NOT EXISTS sessions (
  id          VARCHAR(64) PRIMARY KEY,         -- Random session token
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_type   VARCHAR(20) DEFAULT 'user',      -- user, admin
  ip          INET,                            -- Client IP
  user_agent  TEXT,                            -- Browser/device info
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW()        -- For sliding window
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);


-- ── Admin 2FA Challenges ────────────────────────────────────
-- For admin panel 2FA (password + OTP).
-- Separate from user OTPs for isolation.

CREATE TABLE IF NOT EXISTS admin_2fa_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL,
  otp_hash    VARCHAR(64) NOT NULL,            -- HMAC(challengeId:otp)
  phone       VARCHAR(20) NOT NULL,            -- Target phone
  attempts    INTEGER DEFAULT 0,
  consumed_at TIMESTAMPTZ,                     -- Marked on success
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_2fa_email ON admin_2fa_challenges (email);


-- ── Audit Events ────────────────────────────────────────────
-- Immutable log of all OTP-related events for security monitoring.

CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event       VARCHAR(50) NOT NULL,            -- e.g., "otp.verified"
  phone       VARCHAR(20),                     -- Masked phone
  ip          INET,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Query audit events by type and time
CREATE INDEX idx_audit_event_type ON audit_events (event, created_at DESC);
-- Query by phone (for investigating specific numbers)
CREATE INDEX idx_audit_phone ON audit_events (phone, created_at DESC)
  WHERE phone IS NOT NULL;


-- ── Message Log ─────────────────────────────────────────────
-- Track SMS/Voice/WhatsApp delivery status via Twilio webhooks.

CREATE TABLE IF NOT EXISTS message_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid   VARCHAR(34) UNIQUE NOT NULL,   -- Twilio Message SID
  phone         VARCHAR(20) NOT NULL,
  channel       VARCHAR(10) NOT NULL,          -- sms, voice, whatsapp
  status        VARCHAR(20) DEFAULT 'queued',  -- queued → sent → delivered
  error_code    VARCHAR(10),
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  delivered_at  TIMESTAMPTZ
);

CREATE INDEX idx_message_log_sid ON message_log (message_sid);
CREATE INDEX idx_message_log_phone ON message_log (phone, created_at DESC);


-- ── Cleanup Jobs ────────────────────────────────────────────
-- Run these periodically (cron, pg_cron, or application-level scheduler)
-- to clean up expired data and prevent table bloat.

-- Delete expired OTPs (run every 5 minutes)
-- DELETE FROM sms_otps WHERE expires_at < NOW();

-- Delete expired claims (run every 10 minutes)
-- DELETE FROM phone_verification_claims WHERE expires_at < NOW();

-- Delete expired sessions (run every hour)
-- DELETE FROM sessions WHERE expires_at < NOW();

-- Delete old audit events (run daily, keep 90 days)
-- DELETE FROM audit_events WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete consumed 2FA challenges (run every 10 minutes)
-- DELETE FROM admin_2fa_challenges
--   WHERE consumed_at IS NOT NULL OR expires_at < NOW();
