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
      maybeSingle: () => {
        const match = computeRows()[0] || null;
        return Promise.resolve({ data: match ? { ...match } : null, error: null });
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

  it('skips silently when item is done and source_url is unchanged', async () => {
    const url = 'https://agirlandyourdog.com/schedule/a/AAA/1778666400';
    const supabase = createMockSupabase([makeItem({ external_id: 'AAA', status: 'done', source_url: url })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: url });
    expect(supabase._rows).toHaveLength(1);
    expect(supabase._rows[0].status).toBe('done');
  });

  it('re-queues a permanently-failed item (resets retry_count to 0)', async () => {
    const supabase = createMockSupabase([makeItem({ id: 'id-failed', external_id: 'AAA', status: 'failed', retry_count: 3 })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: 'https://example.com/a/AAA/1' });
    const row = supabase._rows[0];
    expect(row.status).toBe('pending');
    expect(row.retry_count).toBe(0);
    expect(row.last_error).toBeNull();
  });

  // B-3: re-sync appointments modified on AGYD after initial sync
  it('B-3: re-queues done item when source_url timestamp changes (rescheduled appointment)', async () => {
    const oldUrl = 'https://agirlandyourdog.com/schedule/a/C63QAAAB/1778666400';
    const newUrl = 'https://agirlandyourdog.com/schedule/a/C63QAAAB/1778752800';
    const supabase = createMockSupabase([makeItem({ id: 'id-done', external_id: 'AAA', status: 'done', source_url: oldUrl })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: newUrl });
    const row = supabase._rows[0];
    expect(row.status).toBe('pending');
    expect(row.source_url).toBe(newUrl);
    expect(row.retry_count).toBe(0);
  });

  it('B-3: does not re-queue pending item even when source_url changes', async () => {
    const oldUrl = 'https://agirlandyourdog.com/schedule/a/AAA/1778666400';
    const newUrl = 'https://agirlandyourdog.com/schedule/a/AAA/1778752800';
    const supabase = createMockSupabase([makeItem({ external_id: 'AAA', status: 'pending', source_url: oldUrl })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: newUrl });
    expect(supabase._rows[0].status).toBe('pending');
    expect(supabase._rows[0].source_url).toBe(oldUrl);
  });

  it('B-3: does not re-queue done item when existing source_url is null (cannot compare)', async () => {
    const supabase = createMockSupabase([makeItem({ external_id: 'AAA', status: 'done', source_url: null })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: 'https://agirlandyourdog.com/schedule/a/AAA/1778752800' });
    expect(supabase._rows[0].status).toBe('done');
  });

  it('B-3: does not re-queue processing item even when source_url changes', async () => {
    const oldUrl = 'https://agirlandyourdog.com/schedule/a/AAA/1778666400';
    const newUrl = 'https://agirlandyourdog.com/schedule/a/AAA/1778752800';
    const supabase = createMockSupabase([makeItem({ external_id: 'AAA', status: 'processing', source_url: oldUrl })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: newUrl });
    expect(supabase._rows[0].status).toBe('processing');
    expect(supabase._rows[0].source_url).toBe(oldUrl);
  });
});

// ─── enqueue(): what counts as an edit (#278) ─────────────────────────────────

describe('REQ-109: enqueue() edit detection (B-3, #278)', () => {
  const STAY_URL = 'https://agirlandyourdog.com/schedule/a/C63QAAAB/1792404000';
  const NEXT_DAY_URL = 'https://agirlandyourdog.com/schedule/a/C63QAAAB/1792490400';
  const doneItem = (overrides = {}) => makeItem({
    id: 'id-done', external_id: 'AAA', status: 'done', source_url: STAY_URL, title: '10/19-22', meta: {}, ...overrides,
  });

  it('re-queues a done item whose title changed, storing the new title', async () => {
    const supabase = createMockSupabase([doneItem({ title: '10/18PM-23 (Fri)' })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '10/18PM-24am (Sat)' });
    expect(outcome).toBe('requeued_edited');
    expect(supabase._rows[0].status).toBe('pending');
    expect(supabase._rows[0].title).toBe('10/18PM-24am (Sat)');
  });

  it('a title change re-queues even an item the detail step skipped', async () => {
    const supabase = createMockSupabase([doneItem({ title: 'PG:FT', meta: { detail_skip: 'same_day' } })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '10/24-27' });
    expect(outcome).toBe('requeued_edited');
    expect(supabase._rows[0].status).toBe('pending');
  });

  it('a title that differs only in surrounding spaces is not an edit', async () => {
    const supabase = createMockSupabase([doneItem({ title: '10/19-22' })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '  10/19-22 ' });
    expect(outcome).toBe('unchanged');
    expect(supabase._rows[0].status).toBe('done');
  });

  it('an empty stored title is not compared, so it is not an edit', async () => {
    const supabase = createMockSupabase([doneItem({ title: null })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '10/19-22' });
    expect(outcome).toBe('unchanged');
    expect(supabase._rows[0].status).toBe('done');
  });

  it('an empty incoming title is not compared, so it is not an edit', async () => {
    const supabase = createMockSupabase([doneItem({ title: '10/19-22' })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '' });
    expect(outcome).toBe('unchanged');
    expect(supabase._rows[0].status).toBe('done');
  });

  it('a moved URL on a done stay the detail step saved is an edit: re-queued with the new URL and title', async () => {
    const supabase = createMockSupabase([doneItem({ title: '10/19-22' })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: NEXT_DAY_URL, title: '10/19-22' });
    expect(outcome).toBe('requeued_edited');
    expect(supabase._rows[0].status).toBe('pending');
    expect(supabase._rows[0].source_url).toBe(NEXT_DAY_URL);
    expect(supabase._rows[0].title).toBe('10/19-22');
  });

  it('a moved URL on an item the detail step skipped is not an edit: nothing is written', async () => {
    const queuedAt = '2026-10-19T00:05:00.000Z';
    const supabase = createMockSupabase([doneItem({ title: 'PG:FT', meta: { external_pet_id: '10001', detail_skip: 'same_day' }, queued_at: queuedAt })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: NEXT_DAY_URL, title: 'PG:FT' });
    expect(outcome).toBe('url_change_ignored');
    const row = supabase._rows[0];
    expect(row.status).toBe('done');
    expect(row.source_url).toBe(STAY_URL);
    expect(row.queued_at).toBe(queuedAt);
    expect(row.meta).toEqual({ external_pet_id: '10001', detail_skip: 'same_day' });
  });

  it('an empty detail_skip does not count as skipped', async () => {
    const supabase = createMockSupabase([doneItem({ meta: { detail_skip: '' } })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: NEXT_DAY_URL, title: '10/19-22' });
    expect(outcome).toBe('requeued_edited');
  });

  it('a done item with a null meta and a moved URL is re-queued', async () => {
    const supabase = createMockSupabase([doneItem({ meta: null })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: NEXT_DAY_URL, title: '10/19-22' });
    expect(outcome).toBe('requeued_edited');
  });

  it('a re-queue takes the scan\'s meta over the stored values, clearing detail_skip', async () => {
    const supabase = createMockSupabase([doneItem({ title: 'PG:FT', meta: { detail_skip: 'same_day' } })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: 'PG:FT OFF', meta: { external_pet_id: '10002' } });
    expect(supabase._rows[0].meta).toEqual({ external_pet_id: '10002' });
  });

  it('an incoming URL without a timestamp is not an edit', async () => {
    const supabase = createMockSupabase([doneItem()]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: 'https://agirlandyourdog.com/schedule/a/C63QAAAB', title: '10/19-22' });
    expect(outcome).toBe('unchanged');
    expect(supabase._rows[0].status).toBe('done');
  });

  it('a title change on a pending item changes nothing', async () => {
    const supabase = createMockSupabase([doneItem({ status: 'pending', title: '10/19-22' })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '10/19-23' });
    expect(outcome).toBe('unchanged');
    expect(supabase._rows[0].title).toBe('10/19-22');
  });

  it('with resetIfDone a done item takes the reset path and keeps its stored title', async () => {
    const supabase = createMockSupabase([doneItem({ title: 'Dog A' })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: 'Dog B', resetIfDone: true });
    expect(outcome).toBe('requeued');
    expect(supabase._rows[0].status).toBe('pending');
    expect(supabase._rows[0].title).toBe('Dog A');
  });

  // A fake whose single query result and update result can be set, to drive the error paths.
  const fakeDb = ({ existing = null, fetchError = null, updateError = null, insertError = null } = {}) => {
    const tables = [];
    return {
      tables,
      from: (table) => {
        tables.push(table);
        const chain = {
          select: () => chain, eq: () => chain, limit: () => chain,
          maybeSingle: () => Promise.resolve({ data: existing, error: fetchError }),
          update: () => ({ eq: () => Promise.resolve({ error: updateError }) }),
          insert: () => Promise.resolve({ error: insertError }),
        };
        return chain;
      },
    };
  };

  it('a failed read of the existing row is thrown, not treated as a new item', async () => {
    const db = fakeDb({ fetchError: { message: 'read failed' } });
    await expect(enqueue(db, { external_id: 'AAA', source_url: STAY_URL, title: 'x' })).rejects.toEqual({ message: 'read failed' });
  });

  it('a failed write while re-queuing an edited item is thrown', async () => {
    const db = fakeDb({ existing: doneItem({ title: 'old' }), updateError: { message: 'write failed' } });
    await expect(enqueue(db, { external_id: 'AAA', source_url: STAY_URL, title: 'new' })).rejects.toEqual({ message: 'write failed' });
  });

  it('a failed write while re-queuing a failed item is thrown', async () => {
    const db = fakeDb({ existing: doneItem({ status: 'failed' }), updateError: { message: 'write failed' } });
    await expect(enqueue(db, { external_id: 'AAA', source_url: STAY_URL })).rejects.toEqual({ message: 'write failed' });
  });

  it('a failed insert of a new item is thrown', async () => {
    const db = fakeDb({ insertError: { message: 'insert failed' } });
    await expect(enqueue(db, { external_id: 'AAA', source_url: STAY_URL, title: 'x' })).rejects.toEqual({ message: 'insert failed' });
  });

  it('a stored title with surrounding spaces matches the same title from the scan', async () => {
    const supabase = createMockSupabase([doneItem({ title: ' 10/19-22  ' })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '10/19-22' });
    expect(outcome).toBe('unchanged');
  });

  it('a new item without a type is queued as an appointment', async () => {
    const supabase = createMockSupabase([]);
    await enqueue(supabase, { external_id: 'NEW', source_url: STAY_URL, title: 'x' });
    expect(supabase._rows[0].type).toBe('appointment');
  });

  it('resetIfDone does not reset an item that is still pending', async () => {
    const queuedAt = '2026-10-19T00:05:00.000Z';
    const supabase = createMockSupabase([doneItem({ status: 'pending', queued_at: queuedAt, retry_count: 2 })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, resetIfDone: true });
    expect(outcome).toBe('unchanged');
    expect(supabase._rows[0].queued_at).toBe(queuedAt);
    expect(supabase._rows[0].retry_count).toBe(2);
  });

  it('reads the stored title and meta, which the edit rules compare', async () => {
    let selected = null;
    const db = fakeDb({ existing: null });
    const from = db.from;
    db.from = (t) => { const c = from(t); const sel = c.select; c.select = (cols) => { selected ??= cols; return sel(cols); }; return c; };
    await enqueue(db, { external_id: 'AAA', source_url: STAY_URL, title: 'x' });
    expect(selected.split(',').map((c) => c.trim())).toEqual(expect.arrayContaining(['id', 'status', 'source_url', 'title', 'meta']));
  });

  it('an insert that loses the race to a concurrent scan (23505) is unchanged, not an error (#275)', async () => {
    const db = fakeDb({ insertError: { code: '23505', message: 'duplicate key value' } });
    expect(await enqueue(db, { external_id: 'AAA', source_url: STAY_URL, title: 'x' })).toBe('unchanged');
  });

  it('reads and writes only the sync_queue table', async () => {
    const edited = fakeDb({ existing: doneItem({ title: 'old' }) });
    await enqueue(edited, { external_id: 'AAA', source_url: STAY_URL, title: 'new' });
    const failed = fakeDb({ existing: doneItem({ status: 'failed' }) });
    await enqueue(failed, { external_id: 'AAA', source_url: STAY_URL });
    const fresh = fakeDb();
    await enqueue(fresh, { external_id: 'AAA', source_url: STAY_URL, title: 'x' });
    expect([...edited.tables, ...failed.tables, ...fresh.tables]).toEqual(Array(6).fill('sync_queue'));
  });

  it('returns queued for a new item', async () => {
    expect(await enqueue(createMockSupabase([]), { external_id: 'NEW', source_url: STAY_URL, title: 'x' })).toBe('queued');
  });

  it('returns requeued for a failed item', async () => {
    const supabase = createMockSupabase([makeItem({ external_id: 'FAILED', status: 'failed' })]);
    expect(await enqueue(supabase, { external_id: 'FAILED', source_url: STAY_URL })).toBe('requeued');
  });

  it('returns unchanged for a done item with the same title and URL', async () => {
    const supabase = createMockSupabase([doneItem()]);
    expect(await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '10/19-22' })).toBe('unchanged');
  });

  it('a title-change re-queue also stores the scan\'s URL and meta', async () => {
    const supabase = createMockSupabase([doneItem({ title: '10/19-22', meta: {} })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: NEXT_DAY_URL, title: '10/19-23', meta: { external_pet_id: '10003' } });
    expect(supabase._rows[0].source_url).toBe(NEXT_DAY_URL);
    expect(supabase._rows[0].meta).toEqual({ external_pet_id: '10003' });
  });

  it('a re-queue keeps the stored pet ID when the scan has none, and drops detail_skip', async () => {
    const supabase = createMockSupabase([doneItem({ title: 'PG:FT', meta: { external_pet_id: '10001', detail_skip: 'same_day' } })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: STAY_URL, title: '10/24-27', meta: {} });
    expect(supabase._rows[0].meta).toEqual({ external_pet_id: '10001' });
  });

  it('a URL re-queue with a blank title from the scan keeps the stored title', async () => {
    const supabase = createMockSupabase([doneItem({ title: '10/19-22' })]);
    const outcome = await enqueue(supabase, { external_id: 'AAA', source_url: NEXT_DAY_URL, title: '  ' });
    expect(outcome).toBe('requeued_edited');
    expect(supabase._rows[0].title).toBe('10/19-22');
  });

  it('a failed item is re-queued with the scan\'s URL and title', async () => {
    const supabase = createMockSupabase([doneItem({ status: 'failed', title: '10/19-22' })]);
    await enqueue(supabase, { external_id: 'AAA', source_url: NEXT_DAY_URL, title: '10/19-23' });
    expect(supabase._rows[0].status).toBe('pending');
    expect(supabase._rows[0].source_url).toBe(NEXT_DAY_URL);
    expect(supabase._rows[0].title).toBe('10/19-23');
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

  it('stores the meta it is given (the detail step\'s skip reason)', async () => {
    const row = makeItem({ external_id: 'AAA', status: 'processing', meta: { external_pet_id: '10001' } });
    const supabase = createMockSupabase([row]);
    await markDone(supabase, row.id, { meta: { external_pet_id: '10001', detail_skip: 'same_day' } });
    expect(supabase._rows[0].meta).toEqual({ external_pet_id: '10001', detail_skip: 'same_day' });
  });

  it('leaves meta alone when none is given', async () => {
    const row = makeItem({ external_id: 'AAA', status: 'processing', meta: { external_pet_id: '10001' } });
    const supabase = createMockSupabase([row]);
    await markDone(supabase, row.id);
    expect(supabase._rows[0].meta).toEqual({ external_pet_id: '10001' });
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
