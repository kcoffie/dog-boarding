/**
 * Tests for the Picture of the Day data layer (v4.1).
 *
 * getPictureOfDay, hashPicture, shouldSendNotification are all pure functions
 * (or accept an injected supabase client). Tests use fixture data and a
 * minimal supabase mock — no real DB connections needed.
 *
 * @requirements REQ-v4.1
 */

import { describe, it, expect } from 'vitest';
import {
  parseDateParam,
  getPictureOfDay,
  hashPicture,
  shouldSendNotification,
} from '../lib/pictureOfDay.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATE = '2026-03-05';
const YEST = '2026-03-04';

/** Build a minimal daytime_appointment row for test purposes. */
function appt(overrides = {}) {
  return {
    external_id: 'TEST001',
    series_id: 'SRS001',
    worker_external_id: 61023, // Charlie
    pet_names: ['Benny'],
    client_name: 'Kate Coffie',
    service_category: 'DC',
    title: 'DC:FT',
    ...overrides,
  };
}

/**
 * Build a minimal Supabase mock that returns the given row arrays for each query.
 *
 * The mock intercepts .from('daytime_appointments').select(...) chains by
 * tracking the last .eq() call to determine which query is in flight.
 * Workers table returns the provided workers array.
 *
 * This is intentionally minimal — only the fields used by getPictureOfDay.
 */
function buildSupaMock({ todayRows = [], yestRows = [], workerRows = [], boarderRows = [] } = {}) {
  const buildChain = (rows) => {
    const chain = {
      select: () => chain,
      eq: (col, val) => {
        // Distinguish today vs yesterday vs boarding queries
        if (col === 'appointment_date' && val === YEST) {
          chain._rows = yestRows;
        } else if (col === 'service_category' && val === 'Boarding') {
          chain._rows = boarderRows;
        }
        return chain;
      },
      in: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      then: undefined,
      _rows: rows,
    };

    // Make the chain awaitable — resolves to { data: _rows, error: null }
    chain[Symbol.asyncIterator] = undefined;
    Object.defineProperty(chain, 'then', {
      get() {
        return (resolve) => resolve({ data: this._rows, error: null });
      },
    });

    return chain;
  };

  return {
    from: (table) => {
      if (table === 'workers') return buildChain(workerRows);
      // For daytime_appointments, start with todayRows as default
      return buildChain(todayRows);
    },
  };
}

// ---------------------------------------------------------------------------
// parseDateParam
// ---------------------------------------------------------------------------

describe('parseDateParam', () => {
  it('parses a valid YYYY-MM-DD string into a local midnight Date', () => {
    const date = parseDateParam('2026-03-05');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // 0-indexed
    expect(date.getDate()).toBe(5);
  });

  it('throws for an empty string', () => {
    expect(() => parseDateParam('')).toThrow('Invalid date param');
  });

  it('throws for a non-date string', () => {
    expect(() => parseDateParam('not-a-date')).toThrow('Invalid date param');
  });

  it('throws for a partial date', () => {
    expect(() => parseDateParam('2026-03')).toThrow('Invalid date param');
  });
});

// ---------------------------------------------------------------------------
// hashPicture
// ---------------------------------------------------------------------------

describe('hashPicture', () => {
  it('returns a string', () => {
    const data = { date: DATE, workers: [], boarders: [] };
    expect(typeof hashPicture(data)).toBe('string');
  });

  it('returns the same hash for identical data', () => {
    const data = {
      date: DATE,
      workers: [{ workerId: 61023, dogs: [{ series_id: 'SRS001', pet_names: ['Benny'] }] }],
      boarders: ['Millie'],
    };
    expect(hashPicture(data)).toBe(hashPicture(data));
  });

  it('returns a different hash when a dog is added', () => {
    const base = { date: DATE, workers: [], boarders: [] };
    const changed = {
      date: DATE,
      workers: [{ workerId: 61023, dogs: [{ series_id: 'SRS001', pet_names: ['Benny'] }] }],
      boarders: [],
    };
    expect(hashPicture(base)).not.toBe(hashPicture(changed));
  });

  it('returns a different hash when boarders change', () => {
    const base = { date: DATE, workers: [], boarders: ['Benny'] };
    const changed = { date: DATE, workers: [], boarders: ['Millie'] };
    expect(hashPicture(base)).not.toBe(hashPicture(changed));
  });
});

// ---------------------------------------------------------------------------
// shouldSendNotification
// ---------------------------------------------------------------------------

describe('shouldSendNotification', () => {
  const data = { date: DATE, workers: [], boarders: [], hasUpdates: false };

  it('always sends for 4am window regardless of hash', () => {
    const hash = hashPicture(data);
    const result = shouldSendNotification('4am', data, hash);
    expect(result.shouldSend).toBe(true);
    expect(result.reason).toBe('first_send_of_day');
  });

  it('sends for 7am when there is no baseline hash', () => {
    const result = shouldSendNotification('7am', data, null);
    expect(result.shouldSend).toBe(true);
    expect(result.reason).toBe('no_baseline');
  });

  it('skips for 7am when hash is unchanged', () => {
    const hash = hashPicture(data);
    const result = shouldSendNotification('7am', data, hash);
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('no_change');
  });

  it('sends for 8:30am when hash changed', () => {
    const oldHash = hashPicture({ date: DATE, workers: [], boarders: ['Benny'] });
    const result = shouldSendNotification('8:30am', data, oldHash);
    expect(result.shouldSend).toBe(true);
    expect(result.reason).toBe('data_changed');
  });

  it('throws for an invalid window value', () => {
    expect(() => shouldSendNotification('9am', data, null)).toThrow('Invalid window');
  });

  it('returns currentHash in all cases', () => {
    const result = shouldSendNotification('4am', data, null);
    expect(typeof result.currentHash).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// getPictureOfDay — diff logic
// ---------------------------------------------------------------------------

describe('getPictureOfDay diff logic', () => {
  it('marks a dog as added when series_id is new today', async () => {
    const todayAppt = appt({ series_id: 'NEW001', pet_names: ['Benny'] });
    const supa = buildSupaMock({ todayRows: [todayAppt], yestRows: [], workerRows: [] });

    const date = parseDateParam(DATE);
    const result = await getPictureOfDay(supa, date);

    const worker = result.workers[0];
    expect(worker.dogs[0].isAdded).toBe(true);
    expect(worker.dogs[0].isRemoved).toBe(false);
    expect(worker.addedCount).toBe(1);
  });

  it('marks a dog as removed when series_id was yesterday but not today', async () => {
    const yestAppt = appt({ series_id: 'GONE001', pet_names: ['Tasha'], client_name: 'See' });
    const supa = buildSupaMock({ todayRows: [], yestRows: [yestAppt], workerRows: [] });

    const date = parseDateParam(DATE);
    const result = await getPictureOfDay(supa, date);

    const worker = result.workers[0];
    const removedDog = worker.dogs.find(d => d.isRemoved);
    expect(removedDog).toBeDefined();
    expect(removedDog.pet_names).toEqual(['Tasha']);
    expect(worker.removedCount).toBe(1);
  });

  it('marks a dog as unchanged when series_id appears in both days', async () => {
    const sharedAppt = appt({ series_id: 'SAME001', pet_names: ['Benny'] });
    const supa = buildSupaMock({ todayRows: [sharedAppt], yestRows: [sharedAppt], workerRows: [] });

    const date = parseDateParam(DATE);
    const result = await getPictureOfDay(supa, date);

    const worker = result.workers[0];
    expect(worker.dogs[0].isAdded).toBe(false);
    expect(worker.dogs[0].isRemoved).toBe(false);
    expect(worker.addedCount).toBe(0);
    expect(worker.removedCount).toBe(0);
  });

  it('sorts dogs: added → removed → unchanged', async () => {
    const unchanged = appt({ series_id: 'UNC001', pet_names: ['Milo'] });
    const added = appt({ series_id: 'ADD001', pet_names: ['Rex'] });
    const removed = appt({ series_id: 'REM001', pet_names: ['Tasha'] });

    const supa = buildSupaMock({
      todayRows: [unchanged, added],
      yestRows: [unchanged, removed],
      workerRows: [],
    });

    const date = parseDateParam(DATE);
    const result = await getPictureOfDay(supa, date);

    const dogs = result.workers[0].dogs;
    expect(dogs[0].isAdded).toBe(true);
    expect(dogs[1].isRemoved).toBe(true);
    expect(dogs[2].isAdded).toBe(false);
    expect(dogs[2].isRemoved).toBe(false);
  });

  it('treats null series_id dogs as unchanged (conservative)', async () => {
    const noSeries = appt({ series_id: null, pet_names: ['Goose'] });
    const supa = buildSupaMock({ todayRows: [noSeries], yestRows: [], workerRows: [] });

    const date = parseDateParam(DATE);
    const result = await getPictureOfDay(supa, date);

    const dog = result.workers[0].dogs[0];
    expect(dog.isAdded).toBe(false);
    expect(dog.isRemoved).toBe(false);
  });

  it('sets hasUpdates true when any worker has adds or removes', async () => {
    const added = appt({ series_id: 'NEW002', pet_names: ['Buddy'] });
    const supa = buildSupaMock({ todayRows: [added], yestRows: [], workerRows: [] });

    const date = parseDateParam(DATE);
    const result = await getPictureOfDay(supa, date);

    expect(result.hasUpdates).toBe(true);
  });

  it('sets hasUpdates false when all dogs are unchanged', async () => {
    const same = appt({ series_id: 'SAME002', pet_names: ['Luna'] });
    const supa = buildSupaMock({ todayRows: [same], yestRows: [same], workerRows: [] });

    const date = parseDateParam(DATE);
    const result = await getPictureOfDay(supa, date);

    expect(result.hasUpdates).toBe(false);
  });

  it('excludes worker 0 (boardings bucket) from the workers list', async () => {
    const boardingAppt = appt({ worker_external_id: 0, service_category: 'Boarding' });
    // This shouldn't appear since we filter service_category IN ('DC','PG'), but
    // defensively test that worker_external_id 0 is excluded from workers array.
    const supa = buildSupaMock({ todayRows: [boardingAppt], yestRows: [], workerRows: [] });

    const date = parseDateParam(DATE);
    const result = await getPictureOfDay(supa, date);

    expect(result.workers.every(w => w.workerId !== 0)).toBe(true);
  });
});
