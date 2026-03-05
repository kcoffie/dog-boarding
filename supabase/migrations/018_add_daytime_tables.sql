-- v4.0 Daytime Activity Intelligence
--
-- Two new tables:
--   workers            — known staff members, seeded from KNOWN_WORKERS constant
--   daytime_appointments — all DC/PG/Boarding events from the weekly schedule grid
--
-- No detail-page fetches are needed; all fields come from data attributes and
-- child element text on the .day-event <a> elements in the schedule HTML.

-- ---------------------------------------------------------------------------
-- workers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workers (
  id          SERIAL PRIMARY KEY,
  external_id INTEGER UNIQUE NOT NULL,  -- ew-{uid} class value, e.g. 61023
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed known workers (matches KNOWN_WORKERS constant in daytimeSchedule.js).
-- ON CONFLICT DO NOTHING so re-running is safe.
INSERT INTO workers (external_id, name) VALUES
  (61023,  'Charlie'),
  (208669, 'Kathalyn Dominguez'),
  (141407, 'Kentaro Cavey'),
  (174385, 'Max Posse'),
  (189436, 'Sierra Tagle'),
  (164375, 'Stephen Muro')
ON CONFLICT (external_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- daytime_appointments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daytime_appointments (
  id                  SERIAL PRIMARY KEY,

  -- Identity
  external_id         TEXT        NOT NULL,           -- data-id, e.g. "C63QgUnJ"
  series_id           TEXT,                           -- data-series, stable for recurring appts
  appointment_date    DATE        NOT NULL,           -- derived from data-ts (day-column midnight)

  -- Worker / service
  worker_external_id  INTEGER,                        -- ew-{uid}; 0 = no worker (boardings)
  service_category    TEXT,                           -- 'DC', 'PG', 'Boarding', or NULL if unknown
  service_cat_id      INTEGER,                        -- e.g. 5634
  service_id          INTEGER,                        -- e.g. 10692

  -- Display fields
  title               TEXT,                           -- .day-event-title inner text
  status              INTEGER,                        -- 1=upcoming, 5=in-progress, 6=completed
  start_ts            BIGINT,                         -- data-start (Unix seconds, actual check-in)
  day_ts              BIGINT,                         -- data-ts  (Unix seconds, midnight of column)
  display_time        TEXT,                           -- .day-event-time inner text

  -- Client / pets
  client_uid          INTEGER,
  client_name         TEXT,
  pet_ids             INTEGER[],                      -- data-pet values from .event-pet-wrapper
  pet_names           TEXT[],

  -- Flags
  is_pickup           BOOLEAN     NOT NULL DEFAULT FALSE,  -- title/time contains "Pick-Up"
  is_multiday_start   BOOLEAN     NOT NULL DEFAULT FALSE,  -- has class appt-after
  is_multiday_end     BOOLEAN     NOT NULL DEFAULT FALSE,  -- has class appt-before

  -- Housekeeping
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The same external_id can legitimately appear on multiple day columns
  -- (multi-day spanning events). Each (external_id, appointment_date) pair
  -- is distinct and re-syncing the same day updates the row in place.
  UNIQUE (external_id, appointment_date)
);

-- Primary access pattern: "all events for a given date, grouped by worker"
CREATE INDEX IF NOT EXISTS daytime_appts_date_worker_idx
  ON daytime_appointments (appointment_date, worker_external_id);

-- Series lookup: "what series IDs were present on day N for diff computation"
CREATE INDEX IF NOT EXISTS daytime_appts_series_idx
  ON daytime_appointments (series_id)
  WHERE series_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS — service-role key (cron) bypasses RLS; anon key reads allowed
-- ---------------------------------------------------------------------------
ALTER TABLE workers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE daytime_appointments  ENABLE ROW LEVEL SECURITY;

-- Authenticated users (app) can read both tables
CREATE POLICY "Authenticated read workers"
  ON workers FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated read daytime_appointments"
  ON daytime_appointments FOR SELECT
  TO authenticated
  USING (TRUE);
