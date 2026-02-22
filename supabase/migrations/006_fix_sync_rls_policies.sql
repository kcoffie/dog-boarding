-- Migration: 006_fix_sync_rls_policies.sql
-- Version: 2.0.1
-- Description: Fix RLS policies for sync tables - add WITH CHECK for INSERT support
-- Issue: sync_logs INSERT was failing with "new row violates row-level security policy"

-- Drop existing policies (they're missing WITH CHECK clause)
DROP POLICY IF EXISTS "Authenticated users full access" ON sync_appointments;
DROP POLICY IF EXISTS "Authenticated users full access" ON sync_settings;
DROP POLICY IF EXISTS "Authenticated users full access" ON sync_logs;

-- Recreate with both USING (for SELECT/UPDATE/DELETE) and WITH CHECK (for INSERT)
CREATE POLICY "Authenticated users full access" ON sync_appointments
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON sync_settings
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON sync_logs
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
