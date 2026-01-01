-- Migration: Fix night_assignments table for shared access
-- Run this in Supabase SQL Editor

-- First, check current table structure (run this SELECT to see columns):
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'night_assignments';

-- Drop user_id constraint if it exists (from old per-user model)
ALTER TABLE night_assignments DROP COLUMN IF EXISTS user_id;

-- Ensure correct structure
-- The table should have: id, date, employee_id

-- If table doesn't exist, create it:
CREATE TABLE IF NOT EXISTS night_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date)  -- Only one assignment per date
);

-- Ensure RLS is enabled
ALTER TABLE night_assignments ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies and recreate
DROP POLICY IF EXISTS "Authenticated users full access" ON night_assignments;
DROP POLICY IF EXISTS "Users can view own night_assignments" ON night_assignments;
DROP POLICY IF EXISTS "Users can insert own night_assignments" ON night_assignments;
DROP POLICY IF EXISTS "Users can update own night_assignments" ON night_assignments;
DROP POLICY IF EXISTS "Users can delete own night_assignments" ON night_assignments;

-- Create shared access policy
CREATE POLICY "Authenticated users full access"
  ON night_assignments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Verify the fix worked:
-- SELECT tablename, policyname FROM pg_policies WHERE tablename = 'night_assignments';
