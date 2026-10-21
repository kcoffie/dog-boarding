-- Migration 028: booking-site session and breaker (#324 part B, REQ-657)
--
-- One row (the primary key is the boolean `true`, so a second row can't exist) holding:
--   - the booking-site session, moved here from sync_settings (whose session columns are
--     dropped in a later migration, after one good night on this table)
--   - the breaker: set by a rejected login or a 429/403, cleared only by Kate's Clear in Settings
--
-- Row-level security is on and there are no policies, so only the service role (server code)
-- can read or write it. The browser reads the breaker through GET /api/site-access, which never
-- returns the session.
--
-- Order: run this, then deploy part B, outside 23:30–01:30 UTC (the nightly crons).
-- Production's sync_settings has session_cookies (text) and session_expires_at (timestamptz),
-- added by hand; checked 2026-10-21.
--
-- @requirements REQ-657

CREATE TABLE IF NOT EXISTS site_access (
  id                  boolean      PRIMARY KEY DEFAULT true CHECK (id),
  session_cookies     text,
  session_expires_at  timestamptz,
  blocked_at          timestamptz,
  blocked_reason      text,
  cleared_at          timestamptz,
  cleared_by          text,
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE site_access ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon and authenticated can't read or write it.

-- Copy today's session in, so the first runs after the deploy don't need a login.
INSERT INTO site_access (id, session_cookies, session_expires_at)
SELECT true, session_cookies, session_expires_at
FROM sync_settings
ORDER BY id
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- No sync_settings row: still create the single row.
INSERT INTO site_access (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- The session now lives only in site_access. (The empty columns are dropped in a later migration.)
UPDATE sync_settings SET session_cookies = NULL, session_expires_at = NULL;
