-- Migration: Add sync_checkpoints table for batch processing
-- This tracks progress during historical imports so we can resume after failures

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type VARCHAR(50) NOT NULL, -- 'historical', 'incremental'
  target_start_date DATE NOT NULL, -- Where we're trying to sync from
  target_end_date DATE NOT NULL, -- Where we're trying to sync to
  last_completed_date DATE, -- Last date that was fully processed
  total_batches INTEGER DEFAULT 0,
  batches_completed INTEGER DEFAULT 0,
  total_appointments_processed INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_run_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'paused', 'failed'
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding active checkpoints
CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_status ON sync_checkpoints(status);
CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_type ON sync_checkpoints(sync_type);

-- RLS policies
ALTER TABLE sync_checkpoints ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (same as other sync tables)
CREATE POLICY "Allow all for authenticated users" ON sync_checkpoints
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE sync_checkpoints IS 'Tracks progress of batch sync operations for resume capability';
