-- FLOW App — Phase 3 schema updates
-- Adds banned_at tracking; removes legacy 'banned' boolean column
-- resolved_at + resolved_by already exist from 001_initial.sql

-- Add precise ban timestamp (replaces legacy boolean)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

-- Backfill: any users already flagged banned=true get a banned_at timestamp
UPDATE users SET banned_at = now() WHERE banned = true AND banned_at IS NULL;

-- Drop the legacy boolean column (banned_at is the source of truth)
ALTER TABLE users DROP COLUMN IF EXISTS banned;
