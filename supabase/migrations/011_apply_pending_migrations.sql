-- Migration: 011_apply_pending_migrations.sql
-- Description: Consolidated idempotent script to apply migrations 007-010
--              plus the appointments_skipped column added in v2.4.
--
-- Safe to run multiple times (all operations use IF NOT EXISTS or DO blocks).
-- Run this in the Supabase SQL editor if you are unsure which migrations
-- have already been applied.
--
-- Covers:
--   007  - sync_logs: detailed change tracking columns
--   008  - sync_appointments: content hash / change detection
--          sync_settings: setup_mode flag
--   009  - sync_appointments: deletion detection
--          sync_logs: error categorization / triggered_by / archived
--          boardings: cancellation tracking
--   010  - sync_checkpoints table
--   NEW  - sync_logs.appointments_skipped (non-boarding filter count)

-- ===================================================================
-- 007: sync_logs — detailed sync change tracking
-- ===================================================================

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS sync_type VARCHAR(20) DEFAULT 'incremental';
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS appointments_unchanged INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS change_details JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at   ON sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type     ON sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status        ON sync_logs(status);

-- ===================================================================
-- 008: sync_appointments — content hash change detection
--      sync_settings   — setup_mode flag
-- ===================================================================

ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS content_hash      VARCHAR(64);
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS last_change_type  VARCHAR(20);
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS last_changed_at   TIMESTAMPTZ;
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS previous_data     JSONB;

CREATE INDEX IF NOT EXISTS idx_sync_appointments_content_hash    ON sync_appointments(content_hash);
CREATE INDEX IF NOT EXISTS idx_sync_appointments_last_changed_at ON sync_appointments(last_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_appointments_last_change_type ON sync_appointments(last_change_type);

ALTER TABLE sync_settings ADD COLUMN IF NOT EXISTS setup_mode                BOOLEAN    DEFAULT true;
ALTER TABLE sync_settings ADD COLUMN IF NOT EXISTS setup_mode_completed_at   TIMESTAMPTZ;

-- ===================================================================
-- 009: sync_appointments — deletion detection
--      sync_logs        — error categorization / audit
--      boardings        — cancellation tracking
-- ===================================================================

ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS sync_status        VARCHAR(30)  DEFAULT 'active';
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS missing_since      TIMESTAMPTZ;
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS missing_sync_count INTEGER      DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sync_appointments_sync_status   ON sync_appointments(sync_status);
CREATE INDEX IF NOT EXISTS idx_sync_appointments_missing_since ON sync_appointments(missing_since)
  WHERE sync_status = 'missing_from_source';

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS error_category  VARCHAR(30);
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS triggered_by    VARCHAR(50) DEFAULT 'manual';
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS archived        BOOLEAN     DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sync_logs_error_category ON sync_logs(error_category) WHERE error_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_logs_triggered_by   ON sync_logs(triggered_by);

ALTER TABLE boardings ADD COLUMN IF NOT EXISTS cancelled_at          TIMESTAMPTZ;
ALTER TABLE boardings ADD COLUMN IF NOT EXISTS cancellation_reason   VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_boardings_cancelled ON boardings(cancelled_at) WHERE cancelled_at IS NOT NULL;

-- ===================================================================
-- 010: sync_checkpoints table
-- ===================================================================

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type                   VARCHAR(50)  NOT NULL,
  target_start_date           DATE         NOT NULL,
  target_end_date             DATE         NOT NULL,
  last_completed_date         DATE,
  total_batches               INTEGER      DEFAULT 0,
  batches_completed           INTEGER      DEFAULT 0,
  total_appointments_processed INTEGER     DEFAULT 0,
  started_at                  TIMESTAMPTZ  DEFAULT NOW(),
  last_run_at                 TIMESTAMPTZ  DEFAULT NOW(),
  status                      VARCHAR(20)  DEFAULT 'in_progress',
  error_message               TEXT,
  metadata                    JSONB        DEFAULT '{}',
  created_at                  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_status ON sync_checkpoints(status);
CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_type   ON sync_checkpoints(sync_type);

ALTER TABLE sync_checkpoints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sync_checkpoints'
      AND policyname = 'Allow all for authenticated users'
  ) THEN
    CREATE POLICY "Allow all for authenticated users" ON sync_checkpoints
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END;
$$;

COMMENT ON TABLE sync_checkpoints IS 'Tracks progress of batch sync operations for resume capability';

-- ===================================================================
-- NEW (v2.4): sync_logs.appointments_skipped
--   Counts non-boarding appointments filtered out at the detail-page
--   level (after schedule page fetches all appointment types).
-- ===================================================================

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS appointments_skipped INTEGER DEFAULT 0;
