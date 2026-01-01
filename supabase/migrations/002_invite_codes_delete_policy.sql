-- Migration: Add DELETE policy for invite_codes
-- Run this in Supabase SQL Editor

-- Authenticated users can delete invites
CREATE POLICY "Auth users can delete invites"
  ON invite_codes FOR DELETE
  USING (auth.role() = 'authenticated');
