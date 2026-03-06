-- Migration 019: Add updated_at to daytime_appointments
-- Needed for "as of" timestamp in the roster image header (v4.1.1).
-- set_updated_at() trigger function already exists from migration 015.

ALTER TABLE daytime_appointments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: use synced_at as the starting value
UPDATE daytime_appointments SET updated_at = synced_at WHERE updated_at = now();

CREATE TRIGGER daytime_appointments_set_updated_at
  BEFORE UPDATE ON daytime_appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
