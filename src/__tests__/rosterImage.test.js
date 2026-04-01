/**
 * Tests for roster-image.js pure formatting functions.
 * @requirements REQ-M3-4
 *
 * roster-image.js has top-level readFileSync calls (font loading) that would
 * fail in a test environment, so modules with side effects are mocked before
 * import.
 */

import { vi, describe, it, expect } from 'vitest';

// Mock modules with top-level side effects BEFORE importing roster-image.
// readFileSync is called at module load to load Inter font files.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readFileSync: vi.fn(() => Buffer.alloc(0)) };
});
vi.mock('@resvg/resvg-js', () => ({ Resvg: vi.fn() }));
vi.mock('satori', () => ({ default: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../lib/pictureOfDay.js', () => ({
  getPictureOfDay: vi.fn(),
  parseDateParam: vi.fn(),
}));
vi.mock('../lib/htmlUtils.js', () => ({ decodeEntities: (s) => s }));

import { formatAsOf } from '../../api/roster-image.js';

// ---------------------------------------------------------------------------
// formatAsOf
// ---------------------------------------------------------------------------

describe('formatAsOf', () => {
  it('formats a known PST timestamp as "time, weekday M/D"', () => {
    // 2026-01-20T02:04:00Z = Jan 19, 2026 6:04 PM PST (UTC-8, standard time)
    // Jan 19, 2026 is a Monday.
    expect(formatAsOf('2026-01-20T02:04:00.000Z')).toBe('6:04 PM, Mon 1/19');
  });

  it('formats a known PDT timestamp correctly', () => {
    // 2026-05-12T01:03:00Z = May 11, 2026 6:03 PM PDT (UTC-7, daylight time)
    // May 11, 2026 is a Monday.
    expect(formatAsOf('2026-05-12T01:03:00.000Z')).toBe('6:03 PM, Mon 5/11');
  });

  it('returns null for null input', () => {
    expect(formatAsOf(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatAsOf(undefined)).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    expect(formatAsOf('not-a-date')).toBeNull();
  });
});
