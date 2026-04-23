-- Migration 025: Outbound message log (F-2)
--
-- Tracks every WhatsApp send attempt — both image and text — at the moment
-- it leaves the app. Distinct from message_delivery_status (migration 024),
-- which tracks Meta webhook delivery events (delivered/read/failed).
--
-- This table answers: "What exactly did we send, when, and to whom?"
-- message_delivery_status answers: "Did Meta confirm it arrived?"
--
-- Records ALL send attempts including failures (wamid is null for failed sends).
-- image_path stores the Supabase Storage path (including bucket prefix) for image
-- messages so the /messages app page can render the actual PNG inline.
--
-- Retention: rows accumulate indefinitely; volume is low (a few per notify run).
-- No automated TTL needed for now.
--
-- @requirements REQ-v5.0-F2

CREATE TABLE message_log (
  id            bigserial    PRIMARY KEY,
  sent_at       timestamptz  NOT NULL DEFAULT now(),
  job_name      text         NOT NULL,   -- 'notify-4am', 'notify-friday-pm', 'cron-health-check', etc.
  message_type  text         NOT NULL,   -- 'image' | 'text'
  recipient     text         NOT NULL,   -- masked last 4 digits (***-***-7375)
  content       text,                   -- text body for 'text' type; null for 'image' type
  image_path    text,                   -- Supabase Storage path for 'image' type; null for 'text' type
  wamid         text,                   -- null if send failed (no wamid assigned by Meta)
  status        text         NOT NULL   -- 'sent' | 'failed'
);

CREATE INDEX message_log_sent_at_idx ON message_log (sent_at DESC);
CREATE INDEX message_log_job_name_idx ON message_log (job_name, sent_at DESC);

ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON message_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read" ON message_log
  FOR SELECT TO authenticated USING (true);
