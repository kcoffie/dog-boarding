-- Add booking_status column to boardings table.
-- Tracks whether a boarding is a confirmed booking, a pending client request,
-- or should have been skipped (defensive: canceleds are filtered in sync.js before insert).
-- Default 'confirmed' ensures all existing records are treated as confirmed.
ALTER TABLE boardings ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT 'confirmed';
