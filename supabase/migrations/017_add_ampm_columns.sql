-- Add AM/PM columns to boardings table for explicit check-in/check-out time-of-day.
-- Values are 'AM' or 'PM' (uppercase) as extracted from the external site's
-- .event-time-scheduled section. NULL when not available (manual boardings,
-- or boardings synced before this migration).
ALTER TABLE boardings
  ADD COLUMN IF NOT EXISTS arrival_ampm TEXT,
  ADD COLUMN IF NOT EXISTS departure_ampm TEXT;
