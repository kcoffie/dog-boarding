-- P-1: Employee pay daytime follow-on
-- Tracks whether the night shift worker also worked the following calendar day.
-- NULL = not set (treated as false). TRUE = credit daytime dogs at net_percentage.
ALTER TABLE night_assignments
  ADD COLUMN IF NOT EXISTS worked_following_day BOOLEAN DEFAULT NULL;
