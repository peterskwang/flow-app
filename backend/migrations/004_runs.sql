-- Wooverse — Migration 004: Run Tracking Engine
-- Adds runs table + altitude/speed columns to locations

-- 1. Add altitude and speed to locations (may be NULL for legacy rows)
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS altitude_m NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS speed_kmh  NUMERIC(6, 2);

-- 2. Runs table
CREATE TABLE IF NOT EXISTS runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id         UUID REFERENCES groups(id) ON DELETE SET NULL,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER,
  distance_meters  NUMERIC(10, 2),
  vertical_meters  NUMERIC(8, 2),       -- positive = descent depth
  max_speed_kmh    NUMERIC(6, 2),
  avg_speed_kmh    NUMERIC(6, 2),
  top_altitude_m   NUMERIC(8, 2),       -- altitude at run start
  bottom_altitude_m NUMERIC(8, 2),      -- altitude at run end
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'completed', 'discarded')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_user_id       ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_started_at    ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user_status   ON runs(user_id, status);
