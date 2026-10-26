/**
 * Archive reconciliation tests
 * @requirements REQ-108
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyCandidateResponse,
  findReconciliationCandidates,
  archiveSyncAppointment,
  cancelBoardingForArchivedAppointment,
  reconcileArchivedAppointments,
} from '../../lib/scraper/reconcile.js';

vi.mock('../../lib/scraper/auth.js', async (importOriginal) => ({
  SiteThrottled: (await importOriginal()).SiteThrottled,
  authenticatedFetch: vi.fn(),
}));

vi.mock('../../lib/scraper/logger.js', () => ({
  syncLogger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../lib/scraper/config.js', () => ({
  SCRAPER_CONFIG: {
    baseUrl: 'https://agirlandyourdog.com',
    delayBetweenRequests: 0, // No delay in tests
  },
}));

import { authenticatedFetch, SiteThrottled } from '../../lib/scraper/auth.js';

// ─── HTML fixtures ────────────────────────────────────────────────────────────

const VALID_APPT_HTML = '<div id="when-wrapper" data-start_scheduled="1770976800"></div>';
const SCHEDULE_PAGE_HTML = '<div class="schedule">No appointment here</div>';

// ─── Supabase mock helper ─────────────────────────────────────────────────────

/**
 * Creates a minimal Supabase mock that supports the query builder chain used
 * by findReconciliationCandidates and archiveSyncAppointment.
 *
 * The builder is made thenable so `await query` works correctly after all
 * chainable methods (.select, .eq, .lt, .gte) have been called.
 */
// A record's table is its `_table` (default sync_appointments), so boardings can sit beside the sync rows
const tableOf = (r) => r._table ?? 'sync_appointments';
const createMockSupabase = (records = [], { failQuery = false, failUpdate = false } = {}) => {
  const _records = records.map(r => ({ ...r }));

  return {
    _records,
    from: (table) => {
      const state = { filters: {}, lt: null, gte: null, like: null };

      const computeQueryResult = () => {
        if (failQuery) return { data: null, error: { message: 'Query failed' } };
        const data = _records.filter(r => {
          if (tableOf(r) !== table) return false;
          if (state.like && !(r[state.like.f] ?? '').startsWith(state.like.v.replace(/%$/, ''))) return false;
          for (const [f, v] of Object.entries(state.filters)) {
            if (r[f] !== v) return false;
          }
          if (state.lt && r[state.lt.f] >= state.lt.v) return false;
          if (state.gte && r[state.gte.f] < state.gte.v) return false;
          return true;
        });
        return { data, error: null };
      };

      const builder = {
        select: () => builder,
        eq: (f, v) => { state.filters[f] = v; return builder; },
        lt: (f, v) => { state.lt = { f, v }; return builder; },
        gte: (f, v) => { state.gte = { f, v }; return builder; },
        like: (f, v) => { state.like = { f, v }; return builder; },
        update: (data) => ({
          eq: (f, v) => {
            if (failUpdate) return Promise.resolve({ error: { message: 'Update failed' } });
            const idx = _records.findIndex(r => tableOf(r) === table && r[f] === v);
            if (idx >= 0) _records[idx] = { ..._records[idx], ...data };
            return Promise.resolve({ error: null });
          },
        }),
        // Thenable: resolved lazily so all chain calls run first
        then: (onFulfilled, onRejected) =>
          Promise.resolve(computeQueryResult()).then(onFulfilled, onRejected),
        catch: (onRejected) =>
          Promise.resolve(computeQueryResult()).catch(onRejected),
      };

      return builder;
    },
  };
};

// ─── Sample record factory ────────────────────────────────────────────────────

const makeRecord = (overrides = {}) => ({
  id: 'uuid-1',
  external_id: 'C63QgS0U',
  source_url: 'https://agirlandyourdog.com/schedule/a/C63QgS0U/1771581600',
  check_in_datetime: '2026-02-20T00:00:00.000Z',
  check_out_datetime: '2026-02-24T00:00:00.000Z',
  sync_status: 'active',
  ...overrides,
});

const noHeaders = { get: () => null };
const okResponse = (html) => ({ ok: true, status: 200, headers: noHeaders, text: async () => html });
const statusResponse = (status, html = '') => ({ ok: status < 300, status, headers: noHeaders, text: async () => html });
// What a removed booking's URL answers (seen 2026-10-21): 302 to /schedule
const redirectTo = (location, status = 302) => ({
  ok: false, status,
  headers: { get: (name) => (name.toLowerCase() === 'location' ? location : null) },
  text: async () => 'Redirecting...',
});
const goneResponse = () => redirectTo('https://agirlandyourdog.com/schedule');
const candidates = (n) => Array.from({ length: n }, (_, i) =>
  makeRecord({ id: `uuid-${i}`, external_id: `ID${i}`, source_url: `https://agirlandyourdog.com/schedule/a/ID${i}/1` }));

// ─── isAccessDeniedPage() ─────────────────────────────────────────────────────

/** @requirements REQ-657 */
describe('REQ-108, REQ-657: classifyCandidateResponse() — only a redirect to /schedule is gone', () => {
  it('a 302 to /schedule is gone', () => {
    expect(classifyCandidateResponse(goneResponse(), 'Redirecting...')).toBe('gone');
  });

  it('a relative redirect to /schedule is gone', () => {
    expect(classifyCandidateResponse(redirectTo('/schedule'), '')).toBe('gone');
  });

  it('a redirect to the login page is not gone (the session failed)', () => {
    expect(classifyCandidateResponse(redirectTo('https://agirlandyourdog.com/login'), '')).toBe('unexpected');
  });

  it('a redirect to another schedule path is not gone', () => {
    expect(classifyCandidateResponse(redirectTo('/schedule/a/OTHER/1'), '')).toBe('unexpected');
  });

  it('a redirect with no Location is not gone', () => {
    expect(classifyCandidateResponse(redirectTo(null), '')).toBe('unexpected');
  });

  it('a redirect to /schedule on another host is not gone', () => {
    expect(classifyCandidateResponse(redirectTo('https://other.example.com/schedule'), '')).toBe('unexpected');
  });

  it('a 301 to /schedule is gone too', () => {
    expect(classifyCandidateResponse(redirectTo('/schedule', 301), '')).toBe('gone');
  });

  it('a 400 or a 200 that names /schedule in Location is not gone (only redirects count)', () => {
    expect(classifyCandidateResponse(redirectTo('/schedule', 400), '')).toBe('unexpected');
    expect(classifyCandidateResponse(redirectTo('/schedule', 200), '')).toBe('unexpected');
  });

  it('a 200 appointment page is present', () => {
    expect(classifyCandidateResponse(okResponse(VALID_APPT_HTML), VALID_APPT_HTML)).toBe('present');
  });

  it('a 200 page that is not an appointment is not gone', () => {
    expect(classifyCandidateResponse(okResponse(SCHEDULE_PAGE_HTML), SCHEDULE_PAGE_HTML)).toBe('unexpected');
  });

  it('a 500 is not gone, even with an appointment marker in the body', () => {
    expect(classifyCandidateResponse(statusResponse(500, VALID_APPT_HTML), VALID_APPT_HTML)).toBe('unexpected');
  });
});

// ─── findReconciliationCandidates() ──────────────────────────────────────────

describe('REQ-108: findReconciliationCandidates()', () => {
  it('returns active records overlapping window not in seenIds', async () => {
    const records = [
      makeRecord({ external_id: 'AAA', sync_status: 'active' }),
      makeRecord({ external_id: 'BBB', sync_status: 'active' }),
    ];
    const supabase = createMockSupabase(records);
    const seen = new Set(['AAA']);
    const startDate = new Date(2026, 1, 19);
    const endDate = new Date(2026, 1, 21);

    const candidates = await findReconciliationCandidates(supabase, seen, startDate, endDate);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].external_id).toBe('BBB');
  });

  it('does NOT return records outside the sync window', async () => {
    const records = [
      makeRecord({
        external_id: 'OUT',
        sync_status: 'active',
        check_in_datetime: '2026-02-25T00:00:00.000Z', // After window end
        check_out_datetime: '2026-02-28T00:00:00.000Z',
      }),
    ];
    const supabase = createMockSupabase(records);
    const seen = new Set();
    const startDate = new Date(2026, 1, 18); // Feb 18
    const endDate = new Date(2026, 1, 19);   // Feb 19

    const candidates = await findReconciliationCandidates(supabase, seen, startDate, endDate);

    expect(candidates).toHaveLength(0);
  });

  it('does NOT return records already in seenIds', async () => {
    const records = [makeRecord({ external_id: 'AAA', sync_status: 'active' })];
    const supabase = createMockSupabase(records);
    const seen = new Set(['AAA']);

    const candidates = await findReconciliationCandidates(supabase, seen, null, null);

    expect(candidates).toHaveLength(0);
  });

  it('does NOT return records with sync_status != active', async () => {
    const records = [makeRecord({ external_id: 'AAA', sync_status: 'archived' })];
    const supabase = createMockSupabase(records);
    const seen = new Set();

    const candidates = await findReconciliationCandidates(supabase, seen, null, null);

    expect(candidates).toHaveLength(0);
  });

  it('null startDate/endDate returns all active records not in seenIds (full sync)', async () => {
    const records = [
      makeRecord({ external_id: 'AAA', sync_status: 'active' }),
      makeRecord({ external_id: 'BBB', sync_status: 'active' }),
    ];
    const supabase = createMockSupabase(records);
    const seen = new Set();

    const candidates = await findReconciliationCandidates(supabase, seen, null, null);

    expect(candidates).toHaveLength(2);
  });

  it('throws when DB query fails', async () => {
    const supabase = createMockSupabase([], { failQuery: true });

    await expect(findReconciliationCandidates(supabase, new Set(), null, null))
      .rejects.toThrow();
  });
});

// ─── archiveSyncAppointment() ─────────────────────────────────────────────────

describe('REQ-108: archiveSyncAppointment()', () => {
  it('sets sync_status to archived and last_change_type to archived', async () => {
    const records = [makeRecord({ external_id: 'AAA' })];
    const supabase = createMockSupabase(records);

    await archiveSyncAppointment(supabase, 'AAA');

    expect(supabase._records[0].sync_status).toBe('archived');
    expect(supabase._records[0].last_change_type).toBe('archived');
  });

  it('throws when update fails', async () => {
    const supabase = createMockSupabase([], { failUpdate: true });

    await expect(archiveSyncAppointment(supabase, 'AAA')).rejects.toThrow();
  });
});

// ─── cancelBoardingForArchivedAppointment() ───────────────────────────────────

describe('REQ-108: cancelBoardingForArchivedAppointment()', () => {
  it('sets cancelled_at and cancellation_reason on the boarding record', async () => {
    const records = [{ _table: 'boardings', id: 'boarding-uuid-1' }];
    const supabase = createMockSupabase(records);

    await cancelBoardingForArchivedAppointment(supabase, 'boarding-uuid-1');

    expect(supabase._records[0].cancelled_at).toBeTruthy();
    expect(supabase._records[0].cancellation_reason).toBe('appointment_archived');
  });

  it('throws when update fails', async () => {
    const supabase = createMockSupabase([], { failUpdate: true });

    await expect(cancelBoardingForArchivedAppointment(supabase, 'boarding-uuid-1')).rejects.toThrow();
  });
});

// ─── reconcileArchivedAppointments() ─────────────────────────────────────────

describe('REQ-108: reconcileArchivedAppointments()', () => {
  beforeEach(() => {
    vi.resetAllMocks(); // drops queued once-answers from the previous test too
  });

  it('archives a candidate whose URL redirects to /schedule', async () => {
    const records = [makeRecord({ external_id: 'C63QgS0U' })];
    const supabase = createMockSupabase(records);
    authenticatedFetch.mockResolvedValue(goneResponse());

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(1);
    expect(counts.warnings).toBe(0);
    expect(counts.errors).toBe(0);
    expect(supabase._records[0].sync_status).toBe('archived');
  });

  it('logs warn and does NOT archive when source_url loads a valid appointment', async () => {
    const records = [makeRecord({ external_id: 'C63QgS0U' })];
    const supabase = createMockSupabase(records);
    authenticatedFetch.mockResolvedValue(okResponse(VALID_APPT_HTML));

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(0);
    expect(counts.warnings).toBe(1);
    expect(counts.errors).toBe(0);
    expect(supabase._records[0].sync_status).toBe('active');
  });

  it('logs error and does NOT archive when source_url fetch throws', async () => {
    const records = [makeRecord({ external_id: 'C63QgS0U' })];
    const supabase = createMockSupabase(records);
    authenticatedFetch.mockRejectedValue(new Error('Network error'));

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(0);
    expect(counts.warnings).toBe(0);
    expect(counts.errors).toBe(1);
    expect(supabase._records[0].sync_status).toBe('active');
  });

  it('returns { archived:0, warnings:0, errors:1 } and does NOT throw when DB query fails', async () => {
    const supabase = createMockSupabase([], { failQuery: true });

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(0);
    expect(counts.warnings).toBe(0);
    expect(counts.errors).toBe(1);
  });

  /** @requirements REQ-657 */
  it('a fetch error stops reconciliation: later candidates are not opened and nothing is marked', async () => {
    const supabase = createMockSupabase(candidates(2));
    authenticatedFetch.mockRejectedValueOnce(new Error('Timeout')).mockResolvedValueOnce(goneResponse());

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    expect(counts.archived).toBe(0);
    expect(counts.errors).toBe(1);
    expect(counts.skipped).toBe("Reconciliation stopped: ID0 couldn't be opened (Timeout), nothing marked");
  });

  /** @requirements REQ-657 */
  it('an unexpected answer stops reconciliation and marks nothing, even after a gone one', async () => {
    const supabase = createMockSupabase(candidates(3));
    authenticatedFetch
      .mockResolvedValueOnce(goneResponse())
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(goneResponse());

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(counts.archived).toBe(0);
    expect(counts.skipped).toBe('Reconciliation stopped: unexpected answer (HTTP 503) for ID1, nothing marked');
    expect(supabase._records.every(r => r.sync_status === 'active')).toBe(true);
  });

  /** @requirements REQ-657 */
  it('a 429/403 stops the whole run: SiteThrottled is thrown, nothing marked', async () => {
    const supabase = createMockSupabase(candidates(2));
    authenticatedFetch.mockResolvedValueOnce(goneResponse()).mockRejectedValueOnce(new SiteThrottled(429));

    await expect(reconcileArchivedAppointments(supabase, new Set(), null, null)).rejects.toBeInstanceOf(SiteThrottled);
    expect(supabase._records.every(r => r.sync_status === 'active')).toBe(true);
  });

  /** @requirements REQ-657 */
  it('more than 10 candidates: skipped, none opened', async () => {
    const supabase = createMockSupabase(candidates(11));

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(counts.archived).toBe(0);
    expect(counts.skipped).toBe('Reconciliation skipped: 11 bookings missing from the schedule (more than 10), none opened');
    expect([counts.candidates, counts.gone, counts.present]).toEqual([11, [], []]);
  });

  /** @requirements REQ-657 */
  it('10 candidates are all opened', async () => {
    const supabase = createMockSupabase(candidates(10));
    authenticatedFetch.mockResolvedValue(okResponse(VALID_APPT_HTML));

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(authenticatedFetch).toHaveBeenCalledTimes(10);
    expect(counts.skipped).toBe(null);
  });

  /** @requirements REQ-657 */
  it('4 gone: none marked', async () => {
    const supabase = createMockSupabase(candidates(4));
    authenticatedFetch.mockResolvedValue(goneResponse());

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(0);
    expect(counts.skipped).toBe('Reconciliation stopped: 4 bookings look removed (more than 3), nothing marked');
    expect(supabase._records.every(r => r.sync_status === 'active')).toBe(true);
  });

  /** @requirements REQ-657 */
  it('3 gone: all 3 marked', async () => {
    const supabase = createMockSupabase(candidates(3));
    authenticatedFetch.mockResolvedValue(goneResponse());

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(3);
    expect(counts.skipped).toBe(null);
    expect(supabase._records.every(r => r.sync_status === 'archived')).toBe(true);
  });

  /** @requirements REQ-657 */
  it('opens each candidate without following redirects', async () => {
    const supabase = createMockSupabase(candidates(1));
    authenticatedFetch.mockResolvedValue(goneResponse());

    await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(authenticatedFetch).toHaveBeenCalledWith('https://agirlandyourdog.com/schedule/a/ID0/1', { redirect: 'manual' });
  });

  it('does not fetch candidates that are in seenExternalIds', async () => {
    const records = [makeRecord({ external_id: 'AAA' })];
    const supabase = createMockSupabase(records);
    const seen = new Set(['AAA']);

    const counts = await reconcileArchivedAppointments(supabase, seen, null, null);

    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(counts.archived).toBe(0);
  });

  it("cancels every dog's boarding of a removed two-dog booking (<id> and <id>_p1), not another booking's (#316)", async () => {
    const records = [
      makeRecord({ external_id: 'AAA', mapped_boarding_id: 'boarding-uuid-1' }),
      { _table: 'boardings', id: 'boarding-uuid-1', external_id: 'AAA' },
      { _table: 'boardings', id: 'boarding-uuid-2', external_id: 'AAA_p1' },
      { _table: 'boardings', id: 'boarding-uuid-3', external_id: 'AAAB' },
    ];
    const supabase = createMockSupabase(records);
    authenticatedFetch.mockResolvedValue(goneResponse());

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(1);
    expect(counts.errors).toBe(0);
    const reason = (id) => supabase._records.find(r => r.id === id).cancellation_reason ?? null;
    expect([reason('boarding-uuid-1'), reason('boarding-uuid-2'), reason('boarding-uuid-3')])
      .toEqual(['appointment_archived', 'appointment_archived', null]);
    expect(counts.gone[0].dogs).toBe(2);
  });

  it('a booking with no boarding is still archived', async () => {
    const records = [makeRecord({ external_id: 'AAA', mapped_boarding_id: null })];
    const supabase = createMockSupabase(records);
    authenticatedFetch.mockResolvedValue(goneResponse());

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(1);
    expect(counts.errors).toBe(0);
  });

  it('a failed boarding cancel leaves the booking active for the next run, and counts an error (#316)', async () => {
    const records = [
      makeRecord({ external_id: 'AAA' }),
      { _table: 'boardings', id: 'boarding-uuid-1', external_id: 'AAA' },
    ];
    const supabase = createMockSupabase(records, { failUpdate: true });
    authenticatedFetch.mockResolvedValue(goneResponse());

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(0);
    expect(counts.errors).toBe(1);
    expect(supabase._records[0].sync_status).toBe('active');
  });

});
