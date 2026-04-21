-- FLOW App — Phase 4: Push token registration
-- Migration: 003_push_tokens

CREATE TABLE IF NOT EXISTS push_tokens (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);
