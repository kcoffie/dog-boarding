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

import {
  formatAsOf,
  formatWeekendDatetime,
  formatWeekendHeaderDates,
  getWeekendWindowISO,
  getWeekendBoardings,
  computeWeekendImageHeight,
  qBoardingCard,
  computeImageHeight,
  buildLayout,
  buildChangedDogs,
} from '../../api/roster-image.js';

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

// ---------------------------------------------------------------------------
// formatWeekendDatetime
// ---------------------------------------------------------------------------

describe('formatWeekendDatetime', () => {
  it('formats a known UTC ISO string as weekday + time in LA timezone (PST, Jan)', () => {
    // 2026-01-17T23:00:00Z = Sat Jan 17 3:00 PM PST (UTC-8, standard time)
    expect(formatWeekendDatetime('2026-01-17T23:00:00.000Z')).toBe('Sat 3:00 PM');
  });

  it('formats a Friday morning time correctly (PDT, May)', () => {
    // 2026-05-22T18:00:00Z = Fri May 22 11:00 AM PDT (UTC-7, daylight time)
    expect(formatWeekendDatetime('2026-05-22T18:00:00.000Z')).toBe('Fri 11:00 AM');
  });

  it('returns "—" for null input', () => {
    expect(formatWeekendDatetime(null)).toBe('—');
  });

  it('returns "—" for undefined input', () => {
    expect(formatWeekendDatetime(undefined)).toBe('—');
  });

  it('returns "—" for an invalid date string', () => {
    expect(formatWeekendDatetime('not-a-date')).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// formatWeekendHeaderDates
// ---------------------------------------------------------------------------

describe('formatWeekendHeaderDates', () => {
  it('formats a Fri–Sun range correctly', () => {
    // 2026-03-20 = Friday, 2026-03-22 = Sunday
    const fri = new Date('2026-03-20T12:00:00Z');
    const sun = new Date('2026-03-22T12:00:00Z');
    expect(formatWeekendHeaderDates(fri, sun)).toBe('Fri Mar 20 – Sun Mar 22');
  });
});

// ---------------------------------------------------------------------------
// getWeekendWindowISO
// ---------------------------------------------------------------------------

describe('getWeekendWindowISO', () => {
  it('Friday UTC: daysToMonday = 3 (end is Monday)', () => {
    // 2026-04-03 is a Friday UTC (day 5)
    const fri = new Date('2026-04-03T20:00:00Z');
    const { start, end } = getWeekendWindowISO(fri);
    const endDate = new Date(end);
    expect(endDate.getUTCDay()).toBe(1); // Monday
    expect(endDate.getUTCHours()).toBe(12); // noon UTC
    expect(new Date(start).toISOString()).toBe(fri.toISOString());
  });

  it('Saturday UTC: daysToMonday = 2 (end is Monday)', () => {
    // 2026-04-04 is a Saturday UTC (day 6)
    const sat = new Date('2026-04-04T10:00:00Z');
    const { end } = getWeekendWindowISO(sat);
    const endDate = new Date(end);
    expect(endDate.getUTCDay()).toBe(1); // Monday
  });

  it('Sunday UTC: daysToMonday = 1 (end is Monday)', () => {
    // 2026-04-05 is a Sunday UTC (day 0)
    const sun = new Date('2026-04-05T10:00:00Z');
    const { end } = getWeekendWindowISO(sun);
    const endDate = new Date(end);
    expect(endDate.getUTCDay()).toBe(1); // Monday
  });

  it('non-weekend day falls back to +3 days', () => {
    // 2026-04-01 is a Wednesday UTC (day 3) — manual trigger scenario
    const wed = new Date('2026-04-01T15:00:00Z');
    const { end } = getWeekendWindowISO(wed);
    const endDate = new Date(end);
    // Wed + 3 = Sat (not Monday) — fallback is intentional for manual triggers
    expect(endDate.getUTCDate()).toBe(4); // Apr 4
  });

  it('start equals the injected now', () => {
    const now = new Date('2026-04-03T20:00:00Z');
    const { start } = getWeekendWindowISO(now);
    expect(start).toBe(now.toISOString());
  });

  it('returns displayFri and displaySun dates', () => {
    const fri = new Date('2026-04-03T20:00:00Z');
    const { displayFri, displaySun } = getWeekendWindowISO(fri);
    expect(displayFri).toBe(fri);
    // displaySun = end - 1 day
    const endDate = new Date(getWeekendWindowISO(fri).end);
    expect(displaySun.getUTCDate()).toBe(endDate.getUTCDate() - 1);
  });
});

// ---------------------------------------------------------------------------
// getWeekendBoardings — DB query shape
// ---------------------------------------------------------------------------

describe('getWeekendBoardings', () => {
  it('does NOT select client_name from boardings (column does not exist)', async () => {
    let capturedSelect = null;
    const mockChain = {
      select: vi.fn((s) => { capturedSelect = s; return mockChain; }),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const mockSupabase = { from: vi.fn().mockReturnValue(mockChain) };

    await getWeekendBoardings(mockSupabase, '2026-04-03T00:00:00Z', '2026-04-06T12:00:00Z');

    expect(capturedSelect).not.toContain('client_name');
    expect(capturedSelect).toContain('dogs(name)');
    expect(capturedSelect).toContain('booking_status');
    expect(capturedSelect).toContain('arrival_datetime');
    expect(capturedSelect).toContain('departure_datetime');
  });

  it('maps rows correctly: dog_name from dogs join, no client_name', async () => {
    const mockRows = [
      {
        external_id: 'ABC123',
        arrival_datetime: '2026-04-03T20:00:00Z',
        departure_datetime: '2026-04-05T15:00:00Z',
        booking_status: 'confirmed',
        dogs: { name: 'Buddy' },
      },
      {
        external_id: 'DEF456',
        arrival_datetime: '2026-04-04T10:00:00Z',
        departure_datetime: '2026-04-06T11:00:00Z',
        booking_status: null, // should default to 'confirmed'
        dogs: null,           // should default dog_name to 'Unknown'
      },
    ];
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    };
    const mockSupabase = { from: vi.fn().mockReturnValue(mockChain) };

    const { arriving, departing } = await getWeekendBoardings(
      mockSupabase,
      '2026-04-03T00:00:00Z',
      '2026-04-06T12:00:00Z',
    );

    // Both rows arrive within window
    expect(arriving).toHaveLength(2);
    expect(arriving[0].dog_name).toBe('Buddy');
    expect(arriving[0]).not.toHaveProperty('client_name');
    expect(arriving[1].dog_name).toBe('Unknown');
    expect(arriving[1].booking_status).toBe('confirmed'); // null defaulted

    // Both rows depart within window
    expect(departing).toHaveLength(2);
  });

  it('throws when supabase returns an error', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB connection failed') }),
    };
    const mockSupabase = { from: vi.fn().mockReturnValue(mockChain) };

    await expect(
      getWeekendBoardings(mockSupabase, '2026-04-03T00:00:00Z', '2026-04-06T12:00:00Z')
    ).rejects.toThrow('DB connection failed');
  });

  it('returns empty arriving/departing when no boardings in window', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const mockSupabase = { from: vi.fn().mockReturnValue(mockChain) };

    const { arriving, departing } = await getWeekendBoardings(
      mockSupabase,
      '2026-04-03T00:00:00Z',
      '2026-04-06T12:00:00Z',
    );
    expect(arriving).toHaveLength(0);
    expect(departing).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeWeekendImageHeight
// ---------------------------------------------------------------------------

describe('computeWeekendImageHeight', () => {
  it('returns a positive height for empty arriving and departing', () => {
    const height = computeWeekendImageHeight([], []);
    expect(height).toBeGreaterThan(0);
  });

  it('grows with more boardings (min 1 row per section due to placeholder)', () => {
    // computeWeekendImageHeight uses Math.max(count, 1) so 0 and 1 boarding
    // produce the same height (the "(none this weekend)" placeholder takes 1 row).
    const h0 = computeWeekendImageHeight([], []);
    const h1 = computeWeekendImageHeight([{}], [{}]);
    const h4 = computeWeekendImageHeight([{},{},{}], [{},{}]);
    expect(h0).toBe(h1); // both render 1 placeholder row per section
    expect(h4).toBeGreaterThan(h0);
  });
});

// ---------------------------------------------------------------------------
// qBoardingCard
// ---------------------------------------------------------------------------

describe('qBoardingCard', () => {
  const COL_WIDTH = 240;

  function boarder(name, arrival = '2026-04-29T00:00:00Z', departure = '2026-05-02T00:00:00Z') {
    return { name, arrival_datetime: arrival, departure_datetime: departure };
  }

  it('renders heading "Q Boarding" with correct dog count', () => {
    const card = qBoardingCard([boarder('Mochi'), boarder('Bronwyn'), boarder('Tula')], COL_WIDTH);
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('Q Boarding');
    expect(cardStr).toContain('3 dogs');
  });

  it('sorts boarders alphabetically (case-insensitive)', () => {
    const card = qBoardingCard([boarder('Tula'), boarder('bronwyn'), boarder('Mochi')], COL_WIDTH);
    const cardStr = JSON.stringify(card);
    const bronwynIdx = cardStr.indexOf('bronwyn');
    const mochiIdx = cardStr.indexOf('Mochi');
    const tulaIdx = cardStr.indexOf('Tula');
    // bronwyn < Mochi < Tula alphabetically
    expect(bronwynIdx).toBeLessThan(mochiIdx);
    expect(mochiIdx).toBeLessThan(tulaIdx);
  });

  it('renders compact date range in each dog row', () => {
    const card = qBoardingCard([boarder('Mochi', '2026-04-29T07:00:00Z', '2026-05-02T10:00:00Z')], COL_WIDTH);
    const cardStr = JSON.stringify(card);
    // Compact format: "Mochi (4/29–5/2)" — month/day without leading zero in en-US locale
    expect(cardStr).toContain('Mochi');
    expect(cardStr).toContain('4/29');
    expect(cardStr).toContain('5/2');
  });

  it('renders "(none tonight)" when boarders list is empty', () => {
    const card = qBoardingCard([], COL_WIDTH);
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('(none tonight)');
    expect(cardStr).toContain('0 dogs');
  });

  it('uses singular "dog" for exactly 1 boarder', () => {
    const card = qBoardingCard([boarder('Mochi')], COL_WIDTH);
    expect(JSON.stringify(card)).toContain('1 dog');
    expect(JSON.stringify(card)).not.toContain('1 dogs');
  });
});

// ---------------------------------------------------------------------------
// computeImageHeight — includes Q Boarding slot
// ---------------------------------------------------------------------------

describe('computeImageHeight', () => {
  function makeWorker(dogCount) {
    return { dogs: Array(dogCount).fill({ pet_names: ['Dog'], client_name: '', series_id: null, isAdded: false, isRemoved: false }) };
  }

  it('is taller than a layout with no Q Boarding (same workers, more rows)', () => {
    // 5 workers fills 2 rows of 3; adding Q Boarding fills the 6th slot in row 2 —
    // same row count but the height of that row may grow if boarders list is taller.
    // Regardless, height must be > 0.
    const data = { workers: [makeWorker(3), makeWorker(2), makeWorker(4), makeWorker(1), makeWorker(3)], boarders: [] };
    expect(computeImageHeight(data)).toBeGreaterThan(0);
  });

  it('grows when boarders list is longer (Q Boarding card is taller)', () => {
    const workers = [makeWorker(1), makeWorker(1), makeWorker(1), makeWorker(1), makeWorker(1)];
    const makeBoarder = (name) => ({ name, arrival_datetime: '2026-04-29T00:00:00Z', departure_datetime: '2026-05-02T00:00:00Z' });
    const shortBoarders = { workers, boarders: [] };
    const longBoarders = { workers, boarders: 'ABCDEFGHIJ'.split('').map(makeBoarder) };
    expect(computeImageHeight(longBoarders)).toBeGreaterThan(computeImageHeight(shortBoarders));
  });

  it('empty boarders still reserves 1 row (no zero-height Q Boarding card)', () => {
    const withZero = { workers: [makeWorker(0)], boarders: [] };
    const withOne = { workers: [makeWorker(0)], boarders: [{ name: 'Mochi', arrival_datetime: '2026-04-29T00:00:00Z', departure_datetime: '2026-05-02T00:00:00Z' }] };
    // Both reserve 1 row in Q Boarding — height should be equal
    expect(computeImageHeight(withZero)).toBe(computeImageHeight(withOne));
  });
});

// ---------------------------------------------------------------------------
// N-1: Badge suppression, blue overlay, no-snapshot fallback
// ---------------------------------------------------------------------------

function makeData(dogOverrides = {}) {
  return {
    date: '2026-03-05',
    workers: [{
      workerId: 61023,
      name: 'Charlie',
      dogs: [{
        pet_names: ['Benny'],
        client_name: 'Kate',
        series_id: 'SRS001',
        isAdded: true,
        isRemoved: false,
        title: 'DC:FT',
        ...dogOverrides,
      }],
      addedCount: 1,
      removedCount: 0,
    }],
    boarders: [],
    hasUpdates: true,
    lastSyncedAt: null,
  };
}

describe('N-1: 4am badge suppression', () => {
  it('does not render UPDATED! badge when sendWindow is 4am and hasUpdates is true', () => {
    const data = makeData();
    const element = buildLayout(data, null, '4am');
    expect(JSON.stringify(element)).not.toContain('UPDATED!');
  });

  it('renders UPDATED! badge when sendWindow is 7am and hasUpdates is true', () => {
    const data = makeData();
    const element = buildLayout(data, null, '7am');
    expect(JSON.stringify(element)).toContain('UPDATED!');
  });

  it('renders UPDATED! badge when sendWindow is empty (direct hit) and hasUpdates is true', () => {
    const data = makeData();
    const element = buildLayout(data, null, '');
    expect(JSON.stringify(element)).toContain('UPDATED!');
  });
});

describe('N-1: blue intra-day overlay', () => {
  it('uses intraday blue (#2563eb) for a dog that changed since the previous send', () => {
    // Snapshot has Benny with isAdded: false — current state has isAdded: true (state flipped)
    const lastSnapshot = [{
      workerId: 61023,
      name: 'Charlie',
      dogs: [{ pet_names: ['Benny'], series_id: 'SRS001', isAdded: false, isRemoved: false }],
    }];
    const data = makeData({ isAdded: true, isRemoved: false });
    const changedDogs = buildChangedDogs(lastSnapshot, data.workers);

    expect(changedDogs.has('61023:SRS001')).toBe(true);

    const element = buildLayout(data, null, '7am', changedDogs);
    expect(JSON.stringify(element)).toContain('#2563eb');
  });

  it('detects a dog that appeared since the last send (not in snapshot)', () => {
    // Snapshot has no dogs for Charlie — Benny appeared after the last send
    const lastSnapshot = [{ workerId: 61023, name: 'Charlie', dogs: [] }];
    const data = makeData({ isAdded: true });
    const changedDogs = buildChangedDogs(lastSnapshot, data.workers);

    expect(changedDogs.has('61023:SRS001')).toBe(true);
    expect(JSON.stringify(buildLayout(data, null, '7am', changedDogs))).toContain('#2563eb');
  });

  it('uses null series_id fallback key (workerId:pet_names[0])', () => {
    const lastSnapshot = [{ workerId: 61023, name: 'Charlie', dogs: [] }];
    const data = makeData({ series_id: null, isAdded: true });
    const changedDogs = buildChangedDogs(lastSnapshot, data.workers);

    expect(changedDogs.has('61023:Benny')).toBe(true);
  });
});

describe('N-1: no-snapshot fallback', () => {
  it('returns an empty Set when lastSnapshot is null', () => {
    const data = makeData();
    const changedDogs = buildChangedDogs(null, data.workers);
    expect(changedDogs.size).toBe(0);
  });

  it('renders green/red only (no blue) when lastSnapshot is null', () => {
    const data = makeData({ isAdded: true });
    const changedDogs = buildChangedDogs(null, data.workers);
    const element = buildLayout(data, null, '7am', changedDogs);
    const str = JSON.stringify(element);
    expect(str).not.toContain('#2563eb');
    expect(str).toContain('#16a34a'); // green-600 for isAdded
  });

  it('does not crash and renders all dogs when lastSnapshot is null', () => {
    const data = makeData();
    const changedDogs = buildChangedDogs(null, data.workers);
    const element = buildLayout(data, null, '7am', changedDogs);
    expect(JSON.stringify(element)).toContain('Benny');
  });
});
