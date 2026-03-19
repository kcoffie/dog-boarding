-- Migration 021: append-only cron health log
--
-- cron_health is a single-row-per-cron upsert — it only keeps the LATEST run.
-- cron_health_log appends every run, giving us historical visibility for
-- debugging (e.g. seeing that cron-auth fired at 00:12 and skipped re-auth
-- because the session "looked" valid, even though it expired 15 min later).
--
-- Retention policy: rows older than 90 days can be deleted periodically.
-- No automated TTL for now — volume is tiny (4–5 rows/day).

CREATE TABLE IF NOT EXISTS cron_health_log (
  id         BIGSERIAL    PRIMARY KEY,
  cron_name  TEXT         NOT NULL,
  status     TEXT         NOT NULL,
  result     JSONB,
  error_msg  TEXT,
  ran_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index to support queries like "show me the last N runs for cron X"
CREATE INDEX IF NOT EXISTS cron_health_log_cron_name_ran_at_idx
  ON cron_health_log (cron_name, ran_at DESC);

-- RLS: service role has full access; anon/authenticated read-only (same as cron_health)
ALTER TABLE cron_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON cron_health_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated read"
  ON cron_health_log
  FOR SELECT
  TO authenticated
  USING (true);
