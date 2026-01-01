-- Migration: v1.3 Shared Data Access
-- Run this in Supabase SQL Editor
-- Changes RLS from per-user isolation to shared access for all authenticated users

-- ============================================
-- STEP 1: Drop existing per-user policies
-- ============================================

-- Dogs table
DROP POLICY IF EXISTS "Users can view own dogs" ON dogs;
DROP POLICY IF EXISTS "Users can insert own dogs" ON dogs;
DROP POLICY IF EXISTS "Users can update own dogs" ON dogs;
DROP POLICY IF EXISTS "Users can delete own dogs" ON dogs;
DROP POLICY IF EXISTS "Users can manage own dogs" ON dogs;

-- Boardings table
DROP POLICY IF EXISTS "Users can view own boardings" ON boardings;
DROP POLICY IF EXISTS "Users can insert own boardings" ON boardings;
DROP POLICY IF EXISTS "Users can update own boardings" ON boardings;
DROP POLICY IF EXISTS "Users can delete own boardings" ON boardings;
DROP POLICY IF EXISTS "Users can manage own boardings" ON boardings;

-- Employees table
DROP POLICY IF EXISTS "Users can view own employees" ON employees;
DROP POLICY IF EXISTS "Users can insert own employees" ON employees;
DROP POLICY IF EXISTS "Users can update own employees" ON employees;
DROP POLICY IF EXISTS "Users can delete own employees" ON employees;
DROP POLICY IF EXISTS "Users can manage own employees" ON employees;

-- Settings table
DROP POLICY IF EXISTS "Users can view own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
DROP POLICY IF EXISTS "Users can update own settings" ON settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON settings;
DROP POLICY IF EXISTS "Users can manage own settings" ON settings;

-- Night assignments table
DROP POLICY IF EXISTS "Users can view own night_assignments" ON night_assignments;
DROP POLICY IF EXISTS "Users can insert own night_assignments" ON night_assignments;
DROP POLICY IF EXISTS "Users can update own night_assignments" ON night_assignments;
DROP POLICY IF EXISTS "Users can delete own night_assignments" ON night_assignments;
DROP POLICY IF EXISTS "Users can manage own night_assignments" ON night_assignments;

-- Payments table
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
DROP POLICY IF EXISTS "Users can insert own payments" ON payments;
DROP POLICY IF EXISTS "Users can update own payments" ON payments;
DROP POLICY IF EXISTS "Users can delete own payments" ON payments;
DROP POLICY IF EXISTS "Users can manage own payments" ON payments;

-- ============================================
-- STEP 2: Create new shared access policies
-- ============================================

-- Dogs: All authenticated users have full access
CREATE POLICY "Authenticated users full access"
  ON dogs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Boardings: All authenticated users have full access
CREATE POLICY "Authenticated users full access"
  ON boardings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Employees: All authenticated users have full access
CREATE POLICY "Authenticated users full access"
  ON employees FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Settings: All authenticated users have full access
CREATE POLICY "Authenticated users full access"
  ON settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Night assignments: All authenticated users have full access
CREATE POLICY "Authenticated users full access"
  ON night_assignments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Payments: All authenticated users have full access
CREATE POLICY "Authenticated users full access"
  ON payments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- STEP 3: Create invite_codes table
-- ============================================

CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  email TEXT,
  created_by UUID REFERENCES auth.users(id),
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can check if an invite code is valid (for signup validation)
CREATE POLICY "Anyone can check unused invites"
  ON invite_codes FOR SELECT
  USING (used_by IS NULL);

-- Authenticated users can view all invites (for admin panel)
CREATE POLICY "Auth users can view all invites"
  ON invite_codes FOR SELECT
  USING (auth.role() = 'authenticated');

-- Authenticated users can create invites
CREATE POLICY "Auth users can create invites"
  ON invite_codes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow marking invites as used (during signup, user becomes authenticated)
CREATE POLICY "Auth users can update invites"
  ON invite_codes FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ============================================
-- VERIFICATION: Run these to check policies
-- ============================================

-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
