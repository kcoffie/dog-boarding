/**
 * Archive reconciliation tests
 * @requirements REQ-108
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isAccessDeniedPage,
  findReconciliationCandidates,
  archiveSyncAppointment,
  reconcileArchivedAppointments,
} from '../../lib/scraper/reconcile.js';

vi.mock('../../lib/scraper/auth.js', () => ({
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
    delayBetweenRequests: 0, // No delay in tests
  },
}));

import { authenticatedFetch } from '../../lib/scraper/auth.js';

// ─── HTML fixtures ────────────────────────────────────────────────────────────

const VALID_APPT_HTML = '<div id="when-wrapper" data-start_scheduled="1770976800"></div>';
const SCHEDULE_PAGE_HTML = '<div class="schedule">No appointment here</div>';
const LOGIN_PAGE_HTML = '<form>Please login <input type="password" /> here</form>';

// ─── Supabase mock helper ─────────────────────────────────────────────────────

/**
 * Creates a minimal Supabase mock that supports the query builder chain used
 * by findReconciliationCandidates and archiveSyncAppointment.
 *
 * The builder is made thenable so `await query` works correctly after all
 * chainable methods (.select, .eq, .lt, .gte) have been called.
 */
const createMockSupabase = (records = [], { failQuery = false, failUpdate = false } = {}) => {
  const _records = records.map(r => ({ ...r }));

  return {
    _records,
    from: () => {
      const state = { filters: {}, lt: null, gte: null };

      const computeQueryResult = () => {
        if (failQuery) return { data: null, error: { message: 'Query failed' } };
        const data = _records.filter(r => {
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
        update: (data) => ({
          eq: (f, v) => {
            if (failUpdate) return Promise.resolve({ error: { message: 'Update failed' } });
            const idx = _records.findIndex(r => r[f] === v);
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

const okResponse = (html) => ({ ok: true, status: 200, text: async () => html });

// ─── isAccessDeniedPage() ─────────────────────────────────────────────────────

describe('REQ-108: isAccessDeniedPage()', () => {
  it('returns true for non-200 response', () => {
    expect(isAccessDeniedPage('', { ok: false })).toBe(true);
  });

  it('returns true for 200 response serving schedule page (no data-start_scheduled)', () => {
    expect(isAccessDeniedPage(SCHEDULE_PAGE_HTML, { ok: true })).toBe(true);
  });

  it('returns false for valid appointment HTML (has data-start_scheduled)', () => {
    expect(isAccessDeniedPage(VALID_APPT_HTML, { ok: true })).toBe(false);
  });

  it('returns false for login page (session expired, not access denied)', () => {
    expect(isAccessDeniedPage(LOGIN_PAGE_HTML, { ok: true })).toBe(false);
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

// ─── reconcileArchivedAppointments() ─────────────────────────────────────────

describe('REQ-108: reconcileArchivedAppointments()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('archives candidate when source_url is access-denied', async () => {
    const records = [makeRecord({ external_id: 'C63QgS0U' })];
    const supabase = createMockSupabase(records);
    authenticatedFetch.mockResolvedValue(okResponse(SCHEDULE_PAGE_HTML));

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

  it('continues to next candidate after an individual fetch error', async () => {
    const records = [
      makeRecord({ external_id: 'AAA', source_url: 'https://example.com/a/AAA/1' }),
      makeRecord({ external_id: 'BBB', source_url: 'https://example.com/a/BBB/2' }),
    ];
    const supabase = createMockSupabase(records);
    authenticatedFetch
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce(okResponse(SCHEDULE_PAGE_HTML));

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(1);
    expect(counts.errors).toBe(1);
  });

  it('returns correct { archived, warnings, errors } counts across mixed outcomes', async () => {
    const records = [
      makeRecord({ external_id: 'AAA', source_url: 'https://example.com/a/AAA/1' }),
      makeRecord({ external_id: 'BBB', source_url: 'https://example.com/a/BBB/2' }),
      makeRecord({ external_id: 'CCC', source_url: 'https://example.com/a/CCC/3' }),
    ];
    const supabase = createMockSupabase(records);
    authenticatedFetch
      .mockResolvedValueOnce(okResponse(SCHEDULE_PAGE_HTML)) // AAA → access denied → archive
      .mockResolvedValueOnce(okResponse(VALID_APPT_HTML))    // BBB → accessible → warn
      .mockRejectedValueOnce(new Error('Timeout'));           // CCC → error

    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(counts.archived).toBe(1);
    expect(counts.warnings).toBe(1);
    expect(counts.errors).toBe(1);
  });

  it('does not fetch candidates that are in seenExternalIds', async () => {
    const records = [makeRecord({ external_id: 'AAA' })];
    const supabase = createMockSupabase(records);
    const seen = new Set(['AAA']);

    const counts = await reconcileArchivedAppointments(supabase, seen, null, null);

    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(counts.archived).toBe(0);
  });

  it('respects rate limiting between confirmation fetches', async () => {
    const records = [
      makeRecord({ external_id: 'AAA', source_url: 'https://example.com/a/AAA/1' }),
      makeRecord({ external_id: 'BBB', source_url: 'https://example.com/a/BBB/2' }),
    ];
    const supabase = createMockSupabase(records);
    authenticatedFetch.mockResolvedValue(okResponse(SCHEDULE_PAGE_HTML));

    // With delayBetweenRequests: 0 in test config, this just verifies
    // both candidates are processed (delay doesn't block anything)
    const counts = await reconcileArchivedAppointments(supabase, new Set(), null, null);

    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(counts.archived).toBe(2);
  });
});
