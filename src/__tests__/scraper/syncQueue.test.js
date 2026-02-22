/**
 * Sync queue tests
 * @requirements REQ-109
 */

import { describe, it, expect, vi } from 'vitest';
import {
  enqueue,
  dequeueOne,
  markDone,
  markFailed,
  resetStuck,
  getQueueDepth,
} from '../../lib/scraper/syncQueue.js';

vi.mock('../../lib/scraper/logger.js', () => ({
  syncLogger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// ─── Supabase mock helper ─────────────────────────────────────────────────────

let _nextId = 1;

/**
 * Creates a Supabase mock that supports the sync_queue query patterns used by
 * enqueue, dequeueOne, markDone, markFailed, resetStuck, and getQueueDepth.
 */
const createMockSupabase = (initialRows = []) => {
  const rows = initialRows.map(r => ({ ...r }));

  const makeBuilder = () => {
    const state = { filters: {}, ltFilters: {}, orderCol: null, orderAsc: true, limitN: null, orFilter: null, inFilter: null, headCount: false, countExact: false, selectCols: null };

    // Shared result computation — applied by both single() and then()
    const computeRows = () => {
      let result = rows.filter(row => {
        for (const [k, v] of Object.entries(state.filters)) {
          if (row[k] !== v) return false;
        }
        for (const [k, v] of Object.entries(state.ltFilters)) {
          if (!(row[k] < v)) return false;
        }
        if (state.inFilter && !state.inFilter.vals.includes(row[state.inFilter.f])) return false;
        return true;
      });
      if (state.orderCol) {
        result = [...result].sort((a, b) => {
          if (a[state.orderCol] < b[state.orderCol]) return state.orderAsc ? -1 : 1;
          if (a[state.orderCol] > b[state.orderCol]) return state.orderAsc ? 1 : -1;
          return 0;
        });
      }
      if (state.limitN !== null) result = result.slice(0, state.limitN);
      return result;
    };

    const builder = {
      select: (cols, opts = {}) => {
        state.selectCols = cols;
        if (opts.count === 'exact') state.countExact = true;
        if (opts.head) state.headCount = true;
        return builder;
      },
      eq: (f, v) => { state.filters[f] = v; return builder; },
      lt: (f, v) => { state.ltFilters[f] = v; return builder; },
      or: (expr) => { state.orFilter = expr; return builder; },
      in: (f, vals) => { state.inFilter = { f, vals }; return builder; },
      order: (col, { ascending } = {}) => { state.orderCol = col; state.orderAsc = ascending !== false; return builder; },
      limit: (n) => { state.limitN = n; return builder; },
      single: () => {
        const match = computeRows()[0] || null;
        if (!match) return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
        return Promise.resolve({ data: { ...match }, error: null });
      },
      update: (data) => ({
        eq: (f, v) => ({
          eq: (f2, v2) => {
            // double-eq chain (optimistic lock in dequeueOne)
            const row = rows.find(r => r[f] === v && r[f2] === v2);
            if (row) Object.assign(row, data);
            return Promise.resolve({ error: null });
          },
          // single-eq chain
          then: (onFulfilled) => {
            const row = rows.find(r => r[f] === v);
            if (row) Object.assign(row, data);
            return Promise.resolve({ error: null }).then(onFulfilled);
          },
          catch: (onRejected) => Promise.resolve({ error: null }).catch(onRejected),
        }),
      }),
      insert: (data) => {
        const newRow = { id: `id-${_nextId++}`, queued_at: new Date().toISOString(), ...data };
        rows.push(newRow);
        return Promise.resolve({ error: null });
      },
      // Thenable for select queries (without .single())
      then: (onFulfilled, onRejected) => {
        if (state.headCount && state.countExact) {
          const count = computeRows().length;
          return Promise.resolve({ count, error: null }).then(onFulfilled, onRejected);
        }
        const result = computeRows();
        return Promise.resolve({ data: result, error: null }).then(onFulfilled, onRejected);
      },
      catch: (onRejected) => Promise.resolve({ data: [], error: null }).catch(onRejected),
    };
    return builder;
  };

  return {
    _rows: rows,
    from: () => makeBuilder(),
  };
};

const makeItem = (overrides = {}) => ({
  id: `id-${_nextId++}`,
  external_id: `C63Qg${_nextId}XX`,
  source_url: 'https://agirlandyourdog.com/schedule/a/C63QgXXX/1770000000',
  title: 'Buddy 2/1-5',
  status: 'pending',
  retry_count: 0,
  last_error: null,
  queued_at: new Date().toISOString(),
  processing_started_at: null,
  next_retry_at: null,
  processed_at: null,
  ...overrides,
});

// ─── enqueue() ────────────────────────────────────────────────────────────────

describe('REQ-109: enqueue()', () => {
  it('inserts a new item when external_id is not in queue', async () => {
    const supabase = createMockSupabase([]);
    await enqueue(supabase, { external_id: 'AAA', source_url: 'https://example.com/a/AAA/1', title: 'Test' });
    expect(supabase._rows).toHaveLength(1);
    expect(supabase._rows[0].external_id).toBe('AAA');
    expect(supabase._rows[0].status).toBe('pending');
  });

  it('skips silently when item is already pending', async () => {
    const supabase = createMockSupabase([makeItem({ external_id: 'AAA', status: 'pending' })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: 'https://example.com/a/AAA/1' });
    expect(supabase._rows).toHaveLength(1);
  });

  it('skips silently when item is processing', async () => {
    const supabase = createMockSupabase([makeItem({ external_id: 'AAA', status: 'processing' })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: 'https://example.com/a/AAA/1' });
    expect(supabase._rows).toHaveLength(1);
  });

  it('skips silently when item is done', async () => {
    const supabase = createMockSupabase([makeItem({ external_id: 'AAA', status: 'done' })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: 'https://example.com/a/AAA/1' });
    expect(supabase._rows).toHaveLength(1);
  });

  it('re-queues a permanently-failed item (resets retry_count to 0)', async () => {
    const supabase = createMockSupabase([makeItem({ id: 'id-failed', external_id: 'AAA', status: 'failed', retry_count: 3 })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: 'https://example.com/a/AAA/1' });
    const row = supabase._rows[0];
    expect(row.status).toBe('pending');
    expect(row.retry_count).toBe(0);
    expect(row.last_error).toBeNull();
  });
});

// ─── dequeueOne() ─────────────────────────────────────────────────────────────

describe('REQ-109: dequeueOne()', () => {
  it('returns null when queue is empty', async () => {
    const supabase = createMockSupabase([]);
    expect(await dequeueOne(supabase)).toBeNull();
  });

  it('returns null when queue has only processing items (nothing pending)', async () => {
    const supabase = createMockSupabase([makeItem({ status: 'processing' })]);
    expect(await dequeueOne(supabase)).toBeNull();
  });

  it('marks the dequeued item as processing', async () => {
    const supabase = createMockSupabase([makeItem({ external_id: 'AAA', status: 'pending' })]);
    const item = await dequeueOne(supabase);
    expect(item).not.toBeNull();
    expect(item.status).toBe('processing');
    expect(item.processing_started_at).toBeTruthy();
  });

  it('picks the oldest item (sorted by queued_at ascending)', async () => {
    const older = makeItem({ external_id: 'OLD', status: 'pending', queued_at: '2026-02-20T10:00:00Z' });
    const newer = makeItem({ external_id: 'NEW', status: 'pending', queued_at: '2026-02-20T12:00:00Z' });
    const supabase = createMockSupabase([newer, older]);
    const item = await dequeueOne(supabase);
    expect(item.external_id).toBe('OLD');
  });
});

// ─── markDone() ──────────────────────────────────────────────────────────────

describe('REQ-109: markDone()', () => {
  it('sets status to done and processed_at', async () => {
    const row = makeItem({ external_id: 'AAA', status: 'processing' });
    const supabase = createMockSupabase([row]);
    await markDone(supabase, row.id);
    expect(supabase._rows[0].status).toBe('done');
    expect(supabase._rows[0].processed_at).toBeTruthy();
  });
});

// ─── markFailed() ─────────────────────────────────────────────────────────────

describe('REQ-109: markFailed()', () => {
  it('sets status to pending and increments retry_count on first failure', async () => {
    const row = makeItem({ external_id: 'AAA', status: 'processing', retry_count: 0 });
    const supabase = createMockSupabase([row]);
    await markFailed(supabase, row.id, 'Timeout');
    const updated = supabase._rows[0];
    expect(updated.status).toBe('pending');
    expect(updated.retry_count).toBe(1);
    expect(updated.last_error).toBe('Timeout');
  });

  it('sets next_retry_at to roughly now + (retry_count × 5 minutes)', async () => {
    const row = makeItem({ external_id: 'AAA', status: 'processing', retry_count: 0 });
    const supabase = createMockSupabase([row]);
    const before = Date.now();
    await markFailed(supabase, row.id, 'Error');
    const after = Date.now();

    const nextRetry = new Date(supabase._rows[0].next_retry_at).getTime();
    const FIVE_MIN_MS = 5 * 60 * 1000;
    expect(nextRetry).toBeGreaterThanOrEqual(before + FIVE_MIN_MS);
    expect(nextRetry).toBeLessThanOrEqual(after + FIVE_MIN_MS + 1000);
  });

  it('backoff doubles: retry 2 sets next_retry_at to ~now + 10 minutes', async () => {
    const row = makeItem({ external_id: 'AAA', status: 'processing', retry_count: 1 });
    const supabase = createMockSupabase([row]);
    const before = Date.now();
    await markFailed(supabase, row.id, 'Error');
    const after = Date.now();

    const nextRetry = new Date(supabase._rows[0].next_retry_at).getTime();
    const TEN_MIN_MS = 10 * 60 * 1000;
    expect(nextRetry).toBeGreaterThanOrEqual(before + TEN_MIN_MS);
    expect(nextRetry).toBeLessThanOrEqual(after + TEN_MIN_MS + 1000);
  });

  it('permanently fails after MAX_RETRIES (3) with status=failed', async () => {
    const row = makeItem({ external_id: 'AAA', status: 'processing', retry_count: 2 });
    const supabase = createMockSupabase([row]);
    await markFailed(supabase, row.id, 'Permanent error');
    expect(supabase._rows[0].status).toBe('failed');
    expect(supabase._rows[0].retry_count).toBe(3);
  });
});

// ─── resetStuck() ─────────────────────────────────────────────────────────────

describe('REQ-109: resetStuck()', () => {
  it('returns 0 when no items are stuck', async () => {
    const supabase = createMockSupabase([makeItem({ status: 'pending' })]);
    expect(await resetStuck(supabase)).toBe(0);
  });

  it('returns 0 when processing items started recently (under 10 min)', async () => {
    const recentStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const supabase = createMockSupabase([
      makeItem({ status: 'processing', processing_started_at: recentStart }),
    ]);
    expect(await resetStuck(supabase)).toBe(0);
  });

  it('resets stuck items to pending and clears processing_started_at', async () => {
    const staleStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const row = makeItem({ external_id: 'STUCK', status: 'processing', processing_started_at: staleStart });
    const supabase = createMockSupabase([row]);
    const count = await resetStuck(supabase);
    expect(count).toBe(1);
    expect(supabase._rows[0].status).toBe('pending');
    expect(supabase._rows[0].processing_started_at).toBeNull();
  });

  it('resets multiple stuck items in one call', async () => {
    const staleStart = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const supabase = createMockSupabase([
      makeItem({ external_id: 'STUCK1', status: 'processing', processing_started_at: staleStart }),
      makeItem({ external_id: 'STUCK2', status: 'processing', processing_started_at: staleStart }),
    ]);
    const count = await resetStuck(supabase);
    expect(count).toBe(2);
    expect(supabase._rows.every(r => r.status === 'pending')).toBe(true);
  });
});

// ─── getQueueDepth() ─────────────────────────────────────────────────────────

describe('REQ-109: getQueueDepth()', () => {
  it('returns 0 for an empty queue', async () => {
    const supabase = createMockSupabase([]);
    expect(await getQueueDepth(supabase)).toBe(0);
  });

  it('counts pending items', async () => {
    const supabase = createMockSupabase([
      makeItem({ status: 'pending' }),
      makeItem({ status: 'pending' }),
    ]);
    expect(await getQueueDepth(supabase)).toBe(2);
  });

  it('counts processing items', async () => {
    const supabase = createMockSupabase([
      makeItem({ status: 'processing' }),
    ]);
    expect(await getQueueDepth(supabase)).toBe(1);
  });

  it('does not count done or failed items', async () => {
    const supabase = createMockSupabase([
      makeItem({ status: 'done' }),
      makeItem({ status: 'failed' }),
      makeItem({ status: 'pending' }),
    ]);
    expect(await getQueueDepth(supabase)).toBe(1);
  });
});
