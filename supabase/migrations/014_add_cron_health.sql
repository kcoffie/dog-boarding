-- Migration 014: Add cron_health table
-- Tracks the last run time and outcome for each cron job.
-- Replaces reliance on ephemeral Vercel logs (Hobby plan: ~1 hour retention).
-- @requirements REQ-401

CREATE TABLE IF NOT EXISTS cron_health (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name   text        UNIQUE NOT NULL,
  last_ran_at timestamptz NOT NULL DEFAULT now(),
  status      text        NOT NULL CHECK (status IN ('success', 'failure')),
  result      jsonb,
  error_msg   text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: authenticated users can read; cron handlers write via service role (bypasses RLS)
ALTER TABLE cron_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_cron_health"
  ON cron_health
  FOR SELECT
  TO authenticated
  USING (true);
