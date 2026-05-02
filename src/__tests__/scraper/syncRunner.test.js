/**
 * syncRunner tests — pure helpers and key runner branches.
 *
 * Pure functions (buildWeekUrl, advanceCursor, parseScheduleHtml) are tested
 * directly. Runner functions (runScheduleSync, runDetailSync) are tested via
 * mocked dependencies to cover critical branches without network calls.
 *
 * @requirements REQ-109
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildWeekUrl, advanceCursor, parseScheduleHtml, runScheduleSync, runDetailSync } from '../../lib/scraper/syncRunner.js';

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../lib/scraper/auth.js', () => ({
  setSession: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('../../lib/scraper/sessionCache.js', () => ({
  ensureSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('../../lib/scraper/syncQueue.js', () => ({
  enqueue: vi.fn(),
  dequeueOne: vi.fn(),
  markDone: vi.fn(),
  markFailed: vi.fn(),
  resetStuck: vi.fn(),
  getQueueDepth: vi.fn(),
}));

vi.mock('../../lib/scraper/daytimeSchedule.js', () => ({
  parseDaytimeSchedulePage: vi.fn(() => []),
  upsertDaytimeAppointments: vi.fn(() => ({ upserted: 0, errors: 0 })),
}));

vi.mock('../../lib/scraper/extraction.js', () => ({
  fetchAppointmentDetails: vi.fn(),
}));

vi.mock('../../lib/scraper/mapping.js', () => ({
  mapAndSaveAppointment: vi.fn(),
}));

vi.mock('../../lib/scraper/forms.js', () => ({
  fetchAndStoreBoardingForm: vi.fn(),
}));

import { setSession, authenticatedFetch } from '../../lib/scraper/auth.js';
import { ensureSession, clearSession } from '../../lib/scraper/sessionCache.js';
import { dequeueOne, markDone, resetStuck, getQueueDepth } from '../../lib/scraper/syncQueue.js';
import { parseDaytimeSchedulePage, upsertDaytimeAppointments } from '../../lib/scraper/daytimeSchedule.js';
import { fetchAppointmentDetails } from '../../lib/scraper/extraction.js';
import { mapAndSaveAppointment } from '../../lib/scraper/mapping.js';

// ─── Minimal supabase mock ─────────────────────────────────────────────────────

function makeMockSupabase() {
  return {
    from: () => ({
      select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: () => Promise.resolve({ error: null }),
    }),
  };
}

// ─── buildWeekUrl ─────────────────────────────────────────────────────────────

describe('buildWeekUrl', () => {
  it('builds the correct schedule URL for a given date', () => {
    const date = new Date(2026, 2, 20); // March 20, 2026 (month is 0-indexed)
    const url = buildWeekUrl(date);
    expect(url).toMatch(/\/schedule\/days-7\/2026\/3\/20$/);
  });

  it('omits leading zeros from month and day (AGYD URL format)', () => {
    const date = new Date(2026, 0, 5); // January 5
    const url = buildWeekUrl(date);
    expect(url).toMatch(/\/schedule\/days-7\/2026\/1\/5$/);
  });
});

// ─── advanceCursor ────────────────────────────────────────────────────────────

describe('advanceCursor', () => {
  it('advances the cursor by exactly 7 days', () => {
    const cursor = new Date(2026, 2, 1); // March 1
    const next = advanceCursor(cursor);
    expect(next.getDate()).toBe(8);
    expect(next.getMonth()).toBe(2); // still March
  });

  it('wraps back to today when the cursor would exceed today + 56 days', () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 60); // 60 days out, beyond 8-week window
    const next = advanceCursor(farFuture);
    const today = new Date();
    // next should be approximately today (within same day)
    expect(next.toDateString()).toBe(today.toDateString());
  });

  it('does NOT wrap when cursor is within the 8-week window', () => {
    const withinWindow = new Date();
    withinWindow.setDate(withinWindow.getDate() + 14); // 2 weeks out
    const next = advanceCursor(withinWindow);
    const expected = new Date(withinWindow);
    expected.setDate(expected.getDate() + 7);
    expect(next.toDateString()).toBe(expected.toDateString());
  });
});

// ─── parseScheduleHtml ────────────────────────────────────────────────────────

describe('parseScheduleHtml', () => {
  it('returns empty array for HTML with no schedule links', () => {
    expect(parseScheduleHtml('<html><body>no links</body></html>')).toEqual([]);
  });

  it('extracts id, title, petName, and petIds from a schedule link', () => {
    const html = `
      <a href="/schedule/a/C63QgY32/1742342400" class="day-event">
        <span class="day-event-title">Buddy Boarding</span>
        <span class="event-pet" data-pet="90043">Buddy</span>
        <div class="event-pet-wrapper" data-pet="90043"></div>
      </a>
    `;
    const results = parseScheduleHtml(html);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('C63QgY32');
    expect(results[0].title).toBe('Buddy Boarding');
    expect(results[0].petName).toBe('Buddy');
    expect(results[0].petIds).toContain('90043');
    expect(results[0].url).toContain('/schedule/a/C63QgY32/');
  });

  it('deduplicates appointments with the same id', () => {
    const link = `<a href="/schedule/a/DUPEID/111"><span class="day-event-title">Buddy</span></a>`;
    const html = link + link; // same id twice
    const results = parseScheduleHtml(html);
    expect(results).toHaveLength(1);
  });
});

// ─── runScheduleSync — session_failed branch ──────────────────────────────────

describe('runScheduleSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueueDepth.mockResolvedValue(0);
    upsertDaytimeAppointments.mockResolvedValue({ upserted: 0, errors: 0 });
    parseDaytimeSchedulePage.mockReturnValue([]);
  });

  it('returns action=session_failed when ensureSession throws', async () => {
    ensureSession.mockRejectedValue(new Error('No credentials configured'));
    const result = await runScheduleSync(makeMockSupabase());
    expect(result.action).toBe('session_failed');
    expect(result.error).toMatch(/No credentials/);
    expect(result.pagesScanned).toBe(0);
  });

  it('returns action=session_cleared when SESSION_EXPIRED is detected on page fetch', async () => {
    ensureSession.mockResolvedValue('session=abc');
    setSession.mockReturnValue(undefined);
    // authenticatedFetch returns a response whose text includes login/password markers
    authenticatedFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>login password</html>'),
    });
    // supabase mock needs to support getCursorDate (single) and clearSession calls
    const supabase = {
      from: () => ({
        select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve({ error: null }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    };
    clearSession.mockResolvedValue(undefined);
    const result = await runScheduleSync(supabase);
    expect(result.action).toBe('session_cleared');
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('returns action=ok with stats on successful scan with no boardings', async () => {
    ensureSession.mockResolvedValue('session=abc');
    setSession.mockReturnValue(undefined);
    // Return HTML with no matching appointment links
    authenticatedFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body>empty schedule</body></html>'),
    });
    const supabase = {
      from: (table) => {
        if (table === 'sync_settings') {
          return {
            select: () => ({
              limit: () => ({
                single: () => Promise.resolve({ data: { id: '1', schedule_cursor_date: '2026-03-01' }, error: null }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            insert: () => Promise.resolve({ error: null }),
          };
        }
        return {
          select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          insert: () => Promise.resolve({ error: null }),
        };
      },
    };
    getQueueDepth.mockResolvedValue(0);
    const result = await runScheduleSync(supabase);
    expect(result.action).toBe('ok');
    expect(result.found).toBe(0);
    expect(result.queued).toBe(0);
  });

  it('enqueues a "PG 3/23-30" title appointment — PG boarding must NOT be filtered', async () => {
    // Regression test for #114/#115: \bpg\b was incorrectly blocking PG boarding appointments.
    // "PG 3/23-30" is a pack group BOARDING (Boarding Nights pricing), not daycare.
    ensureSession.mockResolvedValue('session=abc');
    setSession.mockReturnValue(undefined);
    const pgHtml = `
      <a href="/schedule/a/C63QgJQ9/1742342400" class="day-event">
        <span class="day-event-title">PG 3/23-30</span>
        <span class="event-pet" data-pet="90043">Kailin</span>
      </a>
    `;
    authenticatedFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(pgHtml),
    });
    const { enqueue } = await import('../../lib/scraper/syncQueue.js');
    enqueue.mockResolvedValue(undefined);
    const supabase = {
      from: (table) => {
        if (table === 'sync_settings') {
          return {
            select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: { id: '1', schedule_cursor_date: '2026-03-01' }, error: null }) }) }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            insert: () => Promise.resolve({ error: null }),
          };
        }
        return {
          select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          insert: () => Promise.resolve({ error: null }),
        };
      },
    };
    getQueueDepth.mockResolvedValue(0);
    const result = await runScheduleSync(supabase);
    expect(result.action).toBe('ok');
    expect(result.found).toBe(1);
    // Must be queued, not skipped
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ external_id: 'C63QgJQ9' }));
    expect(result.skipped).toBe(0);
  });

  it('enqueues "Boarding discounted nights for DC full-time" — mid-title DC must not be filtered', async () => {
    // Regression: C63QghzF (Peanut, Leo Garver, May 1–5 2026). The service name
    // "Boarding discounted nights for DC full-time" contains "DC" as a client tier
    // descriptor. The old /(d\/c|\bdc\b)/i pattern matched the mid-title "DC" word
    // and silently dropped this overnight boarding all day. Fix: anchor to ^(d\/c|dc)\b.
    ensureSession.mockResolvedValue('session=abc');
    setSession.mockReturnValue(undefined);
    const html = `
      <a href="/schedule/a/C63QghzF/1777629600" class="day-event">
        <span class="day-event-title">Boarding discounted nights for DC full-time</span>
        <span class="event-pet" data-pet="138053">Peanut</span>
      </a>
    `;
    authenticatedFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });
    const { enqueue } = await import('../../lib/scraper/syncQueue.js');
    enqueue.mockResolvedValue(undefined);
    const supabase = {
      from: (table) => {
        if (table === 'sync_settings') {
          return {
            select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: { id: '1', schedule_cursor_date: '2026-03-01' }, error: null }) }) }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            insert: () => Promise.resolve({ error: null }),
          };
        }
        return {
          select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          insert: () => Promise.resolve({ error: null }),
        };
      },
    };
    getQueueDepth.mockResolvedValue(0);
    const result = await runScheduleSync(supabase);
    expect(result.action).toBe('ok');
    expect(result.found).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ external_id: 'C63QghzF' }));
    expect(result.skipped).toBe(0);
  });
});

// ─── runDetailSync — key branches ─────────────────────────────────────────────

describe('runDetailSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureSession.mockResolvedValue('session=abc');
    setSession.mockReturnValue(undefined);
    resetStuck.mockResolvedValue(0);
    getQueueDepth.mockResolvedValue(0);
  });

  it('returns action=session_failed when ensureSession throws', async () => {
    ensureSession.mockRejectedValue(new Error('Auth failed'));
    const result = await runDetailSync(makeMockSupabase());
    expect(result.action).toBe('session_failed');
    expect(result.error).toMatch(/Auth failed/);
  });

  it('returns action=idle when queue is empty', async () => {
    dequeueOne.mockResolvedValue(null);
    const result = await runDetailSync(makeMockSupabase());
    expect(result.action).toBe('idle');
  });

  it('calls resetStuck when runResetStuck is true (default)', async () => {
    dequeueOne.mockResolvedValue(null);
    await runDetailSync(makeMockSupabase());
    expect(resetStuck).toHaveBeenCalledTimes(1);
  });

  it('skips resetStuck when runResetStuck is false', async () => {
    dequeueOne.mockResolvedValue(null);
    await runDetailSync(makeMockSupabase(), { runResetStuck: false });
    expect(resetStuck).not.toHaveBeenCalled();
  });

  it('returns action=created after successfully processing an appointment', async () => {
    dequeueOne.mockResolvedValue({
      id: 'queue-1',
      external_id: 'C63QgY32',
      source_url: 'https://agirlandyourdog.com/schedule/a/C63QgY32/1742342400',
      title: 'Buddy',
      type: 'appointment',
      meta: { external_pet_id: '90043' },
      retry_count: 0,
    });
    fetchAppointmentDetails.mockResolvedValue({
      external_id: 'C63QgY32',
      pet_name: 'Buddy',
      arrival_date: '2026-03-20',
    });
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: true, syncUpdated: false, dogUpdated: false, boardingUpdated: false } });
    markDone.mockResolvedValue(undefined);
    getQueueDepth.mockResolvedValue(0);

    const result = await runDetailSync(makeMockSupabase());
    expect(result.action).toBe('created');
    expect(result.externalId).toBe('C63QgY32');
    expect(markDone).toHaveBeenCalledWith(expect.anything(), 'queue-1');
  });

  it('returns action=session_cleared and re-queues item on SESSION_EXPIRED during fetch', async () => {
    dequeueOne.mockResolvedValue({
      id: 'queue-2',
      external_id: 'C63QgY99',
      source_url: 'https://agirlandyourdog.com/schedule/a/C63QgY99/111',
      title: 'Max',
      type: 'appointment',
      meta: {},
      retry_count: 0,
    });
    fetchAppointmentDetails.mockRejectedValue(new Error('Session expired — please re-authenticate'));
    clearSession.mockResolvedValue(undefined);

    const supabase = {
      from: () => ({
        select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve({ error: null }),
      }),
    };

    const result = await runDetailSync(supabase);
    expect(result.action).toBe('session_cleared');
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('returns action=skipped and marks done when applyDetailFilters rejects the appointment', async () => {
    // Regression test: cron path must apply the same post-detail filters as sync.js.
    // A same-day PG daycare appointment (1-hour, no pricing) must be skipped, not saved.
    dequeueOne.mockResolvedValue({
      id: 'queue-pg-daycare',
      external_id: 'C63QgZoi',
      source_url: 'https://agirlandyourdog.com/schedule/a/C63QgZoi/1742860800',
      title: 'PG FT',
      type: 'appointment',
      meta: { external_pet_id: '90043' },
      retry_count: 0,
    });
    fetchAppointmentDetails.mockResolvedValue({
      external_id: 'C63QgZoi',
      pet_name: 'Maverick',
      service_type: 'PG FT',
      booking_status: 'confirmed',
      pricing: null,
      check_in_datetime:  '2026-03-24T10:00:00Z',
      check_out_datetime: '2026-03-24T11:00:00Z', // 1 hour — same-day daycare
    });
    markDone.mockResolvedValue(undefined);
    getQueueDepth.mockResolvedValue(0);

    const result = await runDetailSync(makeMockSupabase());
    expect(result.action).toBe('skipped');
    expect(result.reason).toMatch(/same_day/);
    expect(markDone).toHaveBeenCalledWith(expect.anything(), 'queue-pg-daycare');
    expect(mapAndSaveAppointment).not.toHaveBeenCalled();
  });
});
