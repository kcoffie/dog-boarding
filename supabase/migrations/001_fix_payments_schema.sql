-- Migration: Fix payments table schema
-- Run this in Supabase SQL Editor for both prod and dev databases

-- Add missing columns
ALTER TABLE payments ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS nights INTEGER;

-- Rename columns if they exist with wrong names
-- (Only run these if you have the wrong column names)

-- If you have 'payment_date' instead of 'paid_date':
-- ALTER TABLE payments RENAME COLUMN payment_date TO paid_date;

-- If you have 'paid_dates' instead of 'dates':
-- ALTER TABLE payments RENAME COLUMN paid_dates TO dates;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_paid_date ON payments(paid_date);
