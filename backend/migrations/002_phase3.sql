-- FLOW App — Phase 3 schema updates
-- Adds banned_at tracking + SOS resolution metadata safeguards

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

ALTER TABLE sos_events
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);
