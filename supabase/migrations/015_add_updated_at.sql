-- Migration 015: Add updated_at to boardings and dogs
-- Both tables are mutated by sync (rates, billed_amount, datetime corrections, etc.)
-- but had no way to tell when a row was last modified.

-- Trigger function: set updated_at = now() on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- boardings ---------------------------------------------------------------
ALTER TABLE boardings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: use created_at as a reasonable starting value
UPDATE boardings SET updated_at = created_at WHERE updated_at = now();

CREATE TRIGGER boardings_set_updated_at
  BEFORE UPDATE ON boardings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dogs --------------------------------------------------------------------
ALTER TABLE dogs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE dogs SET updated_at = created_at WHERE updated_at = now();

CREATE TRIGGER dogs_set_updated_at
  BEFORE UPDATE ON dogs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
