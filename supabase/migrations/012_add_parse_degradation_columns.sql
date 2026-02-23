-- Migration: 012_add_parse_degradation_columns.sql
-- Description: Add parse degradation tracking columns to sync_logs (REQ-110)
--
-- After each sync, the scraper counts how many detail-page fetches returned
-- null pet_name or null check_in_datetime. If the null rate exceeds the
-- configurable threshold (SCRAPER_CONFIG.parseNullThreshold), the sync log
-- is written with status = 'parse_degraded' and a UI warning is shown.
--
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS parse_null_count  INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS parse_total_count INTEGER DEFAULT 0;

COMMENT ON COLUMN sync_logs.parse_null_count  IS
  'Number of detail fetches (post-filter, post-fallback) where pet_name OR check_in_datetime was null';
COMMENT ON COLUMN sync_logs.parse_total_count IS
  'Total detail fetches that reached the save stage in this sync run';
