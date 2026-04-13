-- FLOW App — Initial Schema
-- Migration: 001_initial
-- Run: psql -U flow_user -d flow_app -f migrations/001_initial.sql

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  banned      BOOLEAN DEFAULT false
);

-- Groups (ski squads)
CREATE TABLE IF NOT EXISTS groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  invite_code CHAR(6) UNIQUE NOT NULL,
  owner_id    UUID REFERENCES users(id),
  max_members INT DEFAULT 20,
  created_at  TIMESTAMPTZ DEFAULT now(),
  closed_at   TIMESTAMPTZ
);

-- Group memberships
CREATE TABLE IF NOT EXISTS group_members (
  group_id    UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Location pings (latest per user — upserted)
CREATE TABLE IF NOT EXISTS locations (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  group_id    UUID REFERENCES groups(id) ON DELETE SET NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- SOS events
CREATE TABLE IF NOT EXISTS sos_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  group_id    UUID REFERENCES groups(id),
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES users(id)
);
