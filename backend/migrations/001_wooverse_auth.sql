-- Migration: 001_wooverse_auth
-- Adds email/password + Apple Sign In auth columns
-- Makes device_id optional (legacy support)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email           TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash   TEXT,
  ADD COLUMN IF NOT EXISTS apple_sub       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_login_at   TIMESTAMPTZ;

-- device_id is now nullable (legacy clients still send it; new clients don't)
ALTER TABLE users
  ALTER COLUMN device_id DROP NOT NULL;

-- Index for fast email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_apple_sub ON users (apple_sub) WHERE apple_sub IS NOT NULL;

-- Ensure at least one auth method is present (email OR device_id OR apple_sub)
-- Applied as a CHECK constraint; legacy device_id rows are exempt if device_id is non-null
ALTER TABLE users
  ADD CONSTRAINT chk_user_has_auth
  CHECK (
    device_id IS NOT NULL
    OR email IS NOT NULL
    OR apple_sub IS NOT NULL
  );
