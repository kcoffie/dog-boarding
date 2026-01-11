-- Migration: 005_add_sync_tables.sql
-- Version: 2.0.0
-- Description: Add tables for external data sync feature

-- Store raw external appointment data
CREATE TABLE sync_appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id VARCHAR(50) UNIQUE NOT NULL,
  source_url TEXT,

  -- Appointment info
  service_type VARCHAR(100),
  status VARCHAR(50),
  check_in_datetime TIMESTAMP WITH TIME ZONE,
  check_out_datetime TIMESTAMP WITH TIME ZONE,
  scheduled_check_in TEXT,
  scheduled_check_out TEXT,
  duration VARCHAR(50),
  assigned_staff VARCHAR(100),

  -- Client info
  client_name VARCHAR(200),
  client_email_primary VARCHAR(200),
  client_email_secondary VARCHAR(200),
  client_phone VARCHAR(50),
  client_address TEXT,

  -- Instructions
  access_instructions TEXT,
  drop_off_instructions TEXT,
  special_notes TEXT,

  -- Pet info
  pet_name VARCHAR(100),
  pet_photo_url TEXT,
  pet_birthdate DATE,
  pet_breed VARCHAR(100),
  pet_breed_type VARCHAR(100),
  pet_food_allergies TEXT,
  pet_health_mobility TEXT,
  pet_medications TEXT,
  pet_veterinarian JSONB,
  pet_behavioral TEXT,
  pet_bite_history TEXT,

  -- Metadata
  raw_data JSONB, -- Store full scraped data for debugging
  first_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Link to app data
  mapped_dog_id UUID REFERENCES dogs(id),
  mapped_boarding_id UUID REFERENCES boardings(id)
);

-- Sync configuration
CREATE TABLE sync_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  interval_minutes INTEGER DEFAULT 60,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_status VARCHAR(50), -- 'success', 'partial', 'failed'
  last_sync_message TEXT,
  sync_date_range_days INTEGER DEFAULT 30, -- How far ahead to sync
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync history log
CREATE TABLE sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50), -- 'running', 'success', 'partial', 'failed'
  appointments_found INTEGER DEFAULT 0,
  appointments_created INTEGER DEFAULT 0,
  appointments_updated INTEGER DEFAULT 0,
  appointments_failed INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  duration_ms INTEGER
);

-- RLS: All authenticated users can access sync data
ALTER TABLE sync_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

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

-- Add source tracking to existing tables
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS external_id VARCHAR(50);

ALTER TABLE boardings ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
ALTER TABLE boardings ADD COLUMN IF NOT EXISTS external_id VARCHAR(50);

-- Index for external_id lookups
CREATE INDEX IF NOT EXISTS idx_sync_appointments_external_id ON sync_appointments(external_id);
CREATE INDEX IF NOT EXISTS idx_dogs_external_id ON dogs(external_id);
CREATE INDEX IF NOT EXISTS idx_boardings_external_id ON boardings(external_id);
