-- Migration: 008_add_change_detection.sql
-- Version: 2.2.0
-- Description: Add columns for content hash change detection and setup mode (Phase 2)
-- Requirements: REQ-201.1, REQ-201.3, REQ-213, REQ-214, REQ-215

-- =====================================================
-- SYNC_APPOINTMENTS: Content hash for change detection
-- =====================================================

-- Content hash for detecting changes (SHA-256 of key fields)
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Track the type of change that occurred on last sync
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS last_change_type VARCHAR(20);
-- Values: 'created', 'updated', 'unchanged'

-- When the record was last changed (created or updated, not just synced)
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMPTZ;

-- Store previous data when an update occurs (for change tracking/audit)
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS previous_data JSONB;

-- Index for hash lookups to speed up duplicate detection
CREATE INDEX IF NOT EXISTS idx_sync_appointments_content_hash ON sync_appointments(content_hash);

-- Index for finding recently changed records
CREATE INDEX IF NOT EXISTS idx_sync_appointments_last_changed_at ON sync_appointments(last_changed_at DESC);

-- Index for filtering by change type
CREATE INDEX IF NOT EXISTS idx_sync_appointments_last_change_type ON sync_appointments(last_change_type);

-- =====================================================
-- SYNC_SETTINGS: Setup mode toggle
-- =====================================================

-- Setup mode flag: when ON, changes are auto-accepted without flagging
-- When OFF, changes are tracked and can be reviewed
ALTER TABLE sync_settings ADD COLUMN IF NOT EXISTS setup_mode BOOLEAN DEFAULT true;

-- When setup mode was turned off (for audit trail)
ALTER TABLE sync_settings ADD COLUMN IF NOT EXISTS setup_mode_completed_at TIMESTAMPTZ;
