-- Migration 022: Extend cron_health status values
--
-- Adds 'started' to the CHECK constraint on cron_health.status.
-- This enables each cron to write a 'started' row at the top of its run,
-- before any real work. The cron-health-check script can then distinguish:
--   - status='started' with an old last_ran_at → cron launched but hard-crashed
--   - status='failure' → cron ran but returned an error
--   - status='success' → cron completed normally
--
-- The cron_health_log table does not have a CHECK constraint on status,
-- so no changes are needed there.
--
-- @requirements REQ-v5.0-M1-1

ALTER TABLE cron_health
  DROP CONSTRAINT IF EXISTS cron_health_status_check;

ALTER TABLE cron_health
  ADD CONSTRAINT cron_health_status_check
  CHECK (status IN ('success', 'failure', 'started'));
