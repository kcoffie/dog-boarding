-- Migration 030: one dog per booking-site pet ID (#344, REQ-661, ADR-008)
--
-- A dog is its pet ID. The sync writes a pet ID only where none is stored and treats a duplicate as
-- another run having got there first (23505); this index makes the database refuse a second dog with
-- the same pet ID. NULLs stay allowed: staff members' dogs and dogs not yet linked have none.
-- Replaces 016's non-unique index on the same column.
--
-- Order: run this BEFORE the PR 2 deploy, outside 23:30–01:30 UTC (the nightly crons). The code
-- works with or without it, but only the index stops a duplicate for good.
--
-- First, the check (expect 0 rows; if any, stop and fix the data):
--   SELECT external_pet_id, count(*) FROM dogs
--   WHERE external_pet_id IS NOT NULL GROUP BY external_pet_id HAVING count(*) > 1;
--
-- Undo: DROP INDEX dogs_external_pet_id_key; CREATE INDEX idx_dogs_external_pet_id ON dogs(external_pet_id);
--
-- @requirements REQ-661

CREATE UNIQUE INDEX IF NOT EXISTS dogs_external_pet_id_key ON dogs (external_pet_id);
DROP INDEX IF EXISTS idx_dogs_external_pet_id;
