-- Migration: 009_add_deletion_tracking.sql
-- Version: 2.3.0
-- Description: Add columns for deletion detection and production hardening (Phase 4)
-- Requirements: REQ-202, REQ-219, REQ-220, REQ-221, REQ-222

-- =====================================================
-- SYNC_APPOINTMENTS: Deletion detection columns
-- =====================================================

-- Status tracking for missing records
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'active';
-- Values: 'active', 'missing_from_source', 'confirmed_deleted'

-- When the record was first detected as missing
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS missing_since TIMESTAMPTZ;

-- Count of consecutive syncs where this record was missing
ALTER TABLE sync_appointments ADD COLUMN IF NOT EXISTS missing_sync_count INTEGER DEFAULT 0;

-- Index for finding missing records
CREATE INDEX IF NOT EXISTS idx_sync_appointments_sync_status ON sync_appointments(sync_status);
CREATE INDEX IF NOT EXISTS idx_sync_appointments_missing_since ON sync_appointments(missing_since) WHERE sync_status = 'missing_from_source';

-- =====================================================
-- SYNC_LOGS: Error categorization and monitoring
-- =====================================================

-- Categorized error type for easier debugging
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS error_category VARCHAR(30);
-- Values: 'auth_error', 'network_error', 'parse_error', 'save_error', 'rate_limit', 'unknown'

-- Who/what triggered this sync
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(50) DEFAULT 'manual';
-- Values: 'manual', 'scheduled', 'historical'

-- Index for monitoring queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_error_category ON sync_logs(error_category) WHERE error_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_logs_triggered_by ON sync_logs(triggered_by);

-- =====================================================
-- BOARDINGS: Cancellation tracking for deleted syncs
-- =====================================================

-- Track if a boarding was cancelled due to sync deletion
ALTER TABLE boardings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE boardings ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(100);

-- Index for finding cancelled boardings
CREATE INDEX IF NOT EXISTS idx_boardings_cancelled ON boardings(cancelled_at) WHERE cancelled_at IS NOT NULL;

-- =====================================================
-- DATA RETENTION: Archive old sync logs
-- =====================================================

-- Archive flag for old logs
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- Create archive table for old sync logs (optional - for large deployments)
-- This can be used to move old logs to a separate table for performance
-- CREATE TABLE IF NOT EXISTS sync_logs_archive (LIKE sync_logs INCLUDING ALL);
