-- Migration 029: drop the old booking-site session columns from sync_settings (#324, REQ-657)
--
-- Since part B (migration 028, PR #331) the session lives only in site_access, and 028 emptied
-- these two columns. No code reads or writes them any more (the last reader, sessionCache.js, is
-- deleted in the same PR as this migration).
--
-- Order: merge and deploy the PR first, then run this, outside 23:30–01:30 UTC (the nightly
-- crons). It can't be undone: reverting part B after this needs the columns added back.
--
-- @requirements REQ-657

ALTER TABLE sync_settings DROP COLUMN IF EXISTS session_cookies;
ALTER TABLE sync_settings DROP COLUMN IF EXISTS session_expires_at;
