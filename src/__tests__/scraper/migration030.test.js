/**
 * Migration 030: one dog per booking-site pet ID (#344, ADR-008).
 * Read as text (comments dropped): Stryker's sandbox has no supabase/, hence skipIf.
 * @requirements REQ-661
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/030_unique_dog_pet_id.sql');
const code = existsSync(MIGRATION)
  ? readFileSync(MIGRATION, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  : null;

describe.skipIf(code === null)('migration 030: a pet ID can be on one dog only', () => {
  it('creates a unique index on dogs.external_pet_id', () => {
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS dogs_external_pet_id_key ON dogs \(external_pet_id\);/);
  });

  it("is a plain unique index with no WHERE or NOT NULL, so dogs without a pet ID stay allowed", () => {
    expect(code).not.toMatch(/WHERE|NOT NULL/i);
  });

  it("drops 016's non-unique index, after the unique one exists", () => {
    expect(code.indexOf('DROP INDEX IF EXISTS idx_dogs_external_pet_id;')).toBeGreaterThan(code.indexOf('CREATE UNIQUE INDEX'));
  });

  it('drops nothing else', () => {
    expect(code.match(/DROP/gi)).toHaveLength(1);
  });
});
