-- Migration: 007_add_sync_history_columns.sql
-- Version: 2.1.0
-- Description: Add columns for detailed sync change tracking (Phase 1)
-- Requirements: REQ-211, REQ-212

-- Add columns for detailed change tracking on sync_logs
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS sync_type VARCHAR(20) DEFAULT 'incremental';
-- sync_type: 'incremental' for regular syncs, 'historical' for historical imports, 'full' for full re-syncs

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS appointments_unchanged INTEGER DEFAULT 0;
-- Track how many appointments had no changes (hash matched)

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS change_details JSONB DEFAULT '[]';
-- change_details: [{external_id, dog_name, action: 'created'|'updated'|'unchanged', changes: {...}}]

-- Index for history queries (most recent syncs first)
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- Index for filtering by sync type
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type ON sync_logs(sync_type);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
