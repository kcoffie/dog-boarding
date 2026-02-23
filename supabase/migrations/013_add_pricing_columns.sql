-- Migration 013: Add pricing columns for Revenue Intelligence (v2.2)
-- Run AFTER migration 012 (parse degradation columns)
-- @requirements REQ-201

-- boardings: per-booking financial data (null until sync populates them)
ALTER TABLE boardings
  ADD COLUMN IF NOT EXISTS billed_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS night_rate    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS day_rate      NUMERIC(10,2);

-- sync_appointments: raw pricing data from external site
ALTER TABLE sync_appointments
  ADD COLUMN IF NOT EXISTS appointment_total   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pricing_line_items  JSONB;
