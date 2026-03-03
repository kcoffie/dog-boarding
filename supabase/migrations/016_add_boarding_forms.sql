-- Migration 016: Add boarding forms support
-- Adds external_pet_id to dogs, type+meta to sync_queue, and boarding_forms table
-- @requirements REQ-500, REQ-501, REQ-502

-- Add external pet ID to dogs table
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS external_pet_id TEXT;
CREATE INDEX IF NOT EXISTS idx_dogs_external_pet_id ON dogs(external_pet_id);

-- Extend sync_queue to support typed jobs (appointment vs form fetch)
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT 'appointment';
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

-- Boarding forms cache table: stores scraped form data per boarding
CREATE TABLE IF NOT EXISTS boarding_forms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  boarding_id UUID REFERENCES boardings(id) ON DELETE CASCADE,
  external_pet_id TEXT NOT NULL,
  submission_id INTEGER,
  submission_url TEXT NOT NULL,
  form_submitted_at DATE,
  form_arrival_date DATE,
  form_departure_date DATE,
  date_mismatch BOOLEAN DEFAULT false,
  form_data JSONB NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(boarding_id)
);

ALTER TABLE boarding_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON boarding_forms
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_boarding_forms_boarding_id ON boarding_forms(boarding_id);
