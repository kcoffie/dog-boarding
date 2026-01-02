-- Dog Boarding App - Full Database Schema
-- Run this in Supabase SQL Editor to set up a new database

-- ============================================
-- TABLES
-- ============================================

-- Dogs table
CREATE TABLE IF NOT EXISTS dogs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  day_rate NUMERIC(10,2) NOT NULL DEFAULT 35,
  night_rate NUMERIC(10,2) NOT NULL DEFAULT 45,
  notes TEXT DEFAULT '',
  active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Boardings table
CREATE TABLE IF NOT EXISTS boardings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE,
  arrival_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  departure_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  net_percentage NUMERIC(5,2) DEFAULT 65,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Net percentage history (for historical calculations)
CREATE TABLE IF NOT EXISTS net_percentage_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  net_percentage NUMERIC(5,2) NOT NULL,
  effective_date DATE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Night assignments table
CREATE TABLE IF NOT EXISTS night_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  start_date DATE,
  end_date DATE,
  nights INTEGER,
  dates DATE[] DEFAULT '{}',
  paid_date DATE NOT NULL,
  notes TEXT DEFAULT '',
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invite codes table
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

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE boardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_percentage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE night_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - Shared Access Model
-- All authenticated users have full access to all data
-- ============================================

-- Dogs
CREATE POLICY "Authenticated users full access" ON dogs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Boardings
CREATE POLICY "Authenticated users full access" ON boardings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Employees
CREATE POLICY "Authenticated users full access" ON employees
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Settings
CREATE POLICY "Authenticated users full access" ON settings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Net percentage history
CREATE POLICY "Authenticated users full access" ON net_percentage_history
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Night assignments
CREATE POLICY "Authenticated users full access" ON night_assignments
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Payments
CREATE POLICY "Authenticated users full access" ON payments
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Invite codes - special policies
CREATE POLICY "Anyone can check unused invites" ON invite_codes
  FOR SELECT USING (used_by IS NULL);

CREATE POLICY "Auth users can view all invites" ON invite_codes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users can create invites" ON invite_codes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Auth users can update invites" ON invite_codes
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users can delete invites" ON invite_codes
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- INDEXES for better performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_dogs_name ON dogs(name);
CREATE INDEX IF NOT EXISTS idx_dogs_active ON dogs(active);
CREATE INDEX IF NOT EXISTS idx_boardings_dog_id ON boardings(dog_id);
CREATE INDEX IF NOT EXISTS idx_boardings_dates ON boardings(arrival_datetime, departure_datetime);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active);
CREATE INDEX IF NOT EXISTS idx_night_assignments_date ON night_assignments(date);
CREATE INDEX IF NOT EXISTS idx_night_assignments_employee ON night_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
