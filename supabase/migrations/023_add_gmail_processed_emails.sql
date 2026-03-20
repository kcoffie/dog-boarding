-- Migration 023: Gmail processed emails tracking
--
-- Stores every email that the gmail-monitor script has processed, keyed by
-- Gmail message ID. Prevents duplicate WhatsApp alerts if the monitor script
-- runs again before Gmail marks the email as read (or if the script is
-- triggered manually while the hourly cron is also running).
--
-- Retention: rows accumulate indefinitely; volume is very low (a few per month).
-- No automated TTL needed for now.
--
-- @requirements REQ-v5.0-M2

CREATE TABLE IF NOT EXISTS gmail_processed_emails (
  email_id     TEXT        PRIMARY KEY,
  sender       TEXT        NOT NULL,
  subject      TEXT,
  alert_sent   BOOLEAN     NOT NULL DEFAULT TRUE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for looking up recent emails by sender (useful for debugging)
CREATE INDEX IF NOT EXISTS gmail_processed_emails_sender_idx
  ON gmail_processed_emails (sender, processed_at DESC);

-- RLS: service role has full access (script uses service role key)
ALTER TABLE gmail_processed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON gmail_processed_emails
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated read"
  ON gmail_processed_emails
  FOR SELECT
  TO authenticated
  USING (true);
