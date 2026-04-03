-- Migration 024: WhatsApp message delivery status tracking (F-1)
--
-- Stores outbound WhatsApp message records at send time and delivery/read/failed
-- events from Meta's webhook. Enables a full audit trail for every message sent
-- by the app:
--
--   send time:   wamid, masked recipient, send_job, status='sent'
--   webhook:     same wamid, status='delivered'|'read'|'failed'
--
-- UNIQUE(wamid, status): Meta's webhook is guaranteed-at-least-once. The unique
-- constraint on (wamid, status) ensures duplicate events are idempotent —
-- a second 'delivered' event updates status_at but does not create a new row.
-- A single message can produce up to 3 rows: sent → delivered → read.
--
-- recipient: always stored masked (last 4 digits only). Webhook rows use the
-- masked recipient_id from the Meta event. Send rows use the masked number
-- from notifyWhatsApp.js.
--
-- raw_payload: stored for debugging only. Allows reconstruction of any event
-- without relying on Meta's log retention.
--
-- Retention: rows accumulate indefinitely; volume is low (a few per notify run).
-- No automated TTL needed for now.
--
-- @requirements REQ-v5.0-F1

CREATE TABLE IF NOT EXISTS message_delivery_status (
  id            bigserial   PRIMARY KEY,
  wamid         text        NOT NULL,
  recipient     text        NOT NULL,
  send_job      text        NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  status        text        NOT NULL,
  status_at     timestamptz,
  error_code    int,
  error_title   text,
  raw_payload   jsonb,

  CONSTRAINT message_delivery_status_wamid_status_key UNIQUE (wamid, status)
);

-- Index for webhook lookups: "give me all events for this wamid"
CREATE INDEX IF NOT EXISTS message_delivery_status_wamid_idx
  ON message_delivery_status (wamid);

-- Index for job-level queries: "show me all messages sent by notify-4am today"
CREATE INDEX IF NOT EXISTS message_delivery_status_send_job_sent_at_idx
  ON message_delivery_status (send_job, sent_at DESC);

-- RLS: service role has full access (all writes use service role key)
ALTER TABLE message_delivery_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON message_delivery_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated read"
  ON message_delivery_status
  FOR SELECT
  TO authenticated
  USING (true);
