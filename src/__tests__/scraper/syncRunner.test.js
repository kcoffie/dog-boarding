/**
 * syncRunner tests — pure helpers and key runner branches.
 *
 * Pure functions (buildWeekUrl, advanceCursor, parseScheduleHtml) are tested
 * directly. Runner functions (runScheduleSync, runDetailSync) are tested via
 * mocked dependencies to cover critical branches without network calls.
 *
 * @requirements REQ-109
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { enqueue, dequeueOne, markDone, markFailed, resetStuck, getQueueDepth } from '../../lib/scraper/syncQueue.js';
import { parseDaytimeSchedulePage, upsertDaytimeAppointments } from '../../lib/scraper/daytimeSchedule.js';
import { fetchAppointmentDetails } from '../../lib/scraper/extraction.js';
import { mapAndSaveAppointment } from '../../lib/scraper/mapping.js';
import { fetchAndStoreBoardingForm } from '../../lib/scraper/forms.js';

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
        <span class="event-pet" data-pet="10008">Buddy</span>
        <div class="event-pet-wrapper" data-pet="10008"></div>
      </a>
    `;
    const results = parseScheduleHtml(html);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('C63QgY32');
    expect(results[0].title).toBe('Buddy Boarding');
    expect(results[0].petName).toBe('Buddy');
    expect(results[0].petIds).toContain('10008');
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
        <span class="event-pet" data-pet="10008">Rocket</span>
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
    // Regression: C63QAAAA (Peanut, May 1–5 2026). The service name
    // "Boarding discounted nights for DC full-time" contains "DC" as a client tier
    // descriptor. The old /(d\/c|\bdc\b)/i pattern matched the mid-title "DC" word
    // and silently dropped this overnight boarding all day. Fix: anchor to ^(d\/c|dc)\b.
    ensureSession.mockResolvedValue('session=abc');
    setSession.mockReturnValue(undefined);
    const html = `
      <a href="/schedule/a/C63QAAAA/1777629600" class="day-event">
        <span class="day-event-title">Boarding discounted nights for DC full-time</span>
        <span class="event-pet" data-pet="10006">Peanut</span>
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
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ external_id: 'C63QAAAA' }));
    expect(result.skipped).toBe(0);
  });

  it('skips "PT: T.W.TH" appointment — Part-Time daycare must not be enqueued as a boarding', async () => {
    // Regression: C63QgiVF (Rover, May 4 2026). "PT: T.W.TH" is a recurring
    // Part-Time daycare appointment using the /schedule/a/ URL format. Missing ^PT\b
    // in nonBoardingPatterns caused the integration check DOM scanner to flag it as
    // a boarding candidate and fire false "Missing from DB" alerts every run.
    ensureSession.mockResolvedValue('session=abc');
    setSession.mockReturnValue(undefined);
    const html = `
      <a href="/schedule/a/C63QgiVF/1777975200" class="day-event">
        <span class="day-event-title">PT: T.W.TH</span>
        <span class="event-pet" data-pet="10007">Rover</span>
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
    expect(enqueue).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
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
      meta: { external_pet_id: '10008' },
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
      meta: { external_pet_id: '10008' },
      retry_count: 0,
    });
    fetchAppointmentDetails.mockResolvedValue({
      external_id: 'C63QgZoi',
      pet_name: 'Rover',
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

// ─── REQ-109 shared runners: one test per acceptance criterion ────────────────
// Expected values come from the REQ-109 "Shared runners" criteria, worked by hand.
// The clock is fixed at local midnight Monday 2026-10-19, so this week's page is
// 10/19 and next week's is 10/26. Only Date is faked; promises run normally.

const SITE = 'https://agirlandyourdog.com';

// A Supabase fake that records what the runners write. sync_settings holds at most one row.
function makeDb({ cursor = null, hasSettingsRow = true } = {}) {
  const calls = { settingsUpdates: [], settingsInserts: [], queueUpdates: [] };
  return {
    calls,
    from(table) {
      if (table === 'sync_settings') {
        return {
          select: () => ({ limit: () => ({ single: () => Promise.resolve({
            data: hasSettingsRow ? { id: 'settings-1', schedule_cursor_date: cursor } : null, error: null,
          }) }) }),
          update: (values) => ({ eq: (col, val) => { calls.settingsUpdates.push({ values, col, val }); return Promise.resolve({ error: null }); } }),
          insert: (values) => { calls.settingsInserts.push(values); return Promise.resolve({ error: null }); },
        };
      }
      if (table === 'sync_queue') {
        return { update: (values) => ({ eq: (col, val) => { calls.queueUpdates.push({ values, col, val }); return Promise.resolve({ error: null }); } }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

// One schedule link in AGYD's markup.
function link({ id, ts = '1792836000', title = '', pet = '', petId = null, href = null }) {
  const petAttr = petId ? ` data-pet="${petId}"` : '';
  return `<a href="${href ?? `/schedule/a/${id}/${ts}`}" class="day-event">`
    + `<span class="day-event-title">${title}</span><span class="event-pet"${petAttr}>${pet}</span></a>`;
}

// Serve schedule pages by URL; unknown URLs get an empty page.
function servePages(pages = {}) {
  authenticatedFetch.mockImplementation((url) => Promise.resolve({
    ok: true, status: 200, text: () => Promise.resolve(`<html><body>${pages[url] ?? ''}</body></html>`),
  }));
}

const fetchedUrls = () => authenticatedFetch.mock.calls.map(([url]) => url);

describe('REQ-109 runScheduleSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ensureSession.mockResolvedValue('session=abc');
    enqueue.mockResolvedValue(undefined);
    getQueueDepth.mockResolvedValue(0);
    parseDaytimeSchedulePage.mockReturnValue([]);
    upsertDaytimeAppointments.mockResolvedValue({ upserted: 0, errors: 0 });
    servePages();
  });
  afterEach(() => vi.useRealTimers());

  it('fetches this week, next week and the cursor week', async () => {
    const result = await runScheduleSync(makeDb({ cursor: '2026-11-16' }));
    expect(fetchedUrls()).toEqual([
      `${SITE}/schedule/days-7/2026/10/19`,
      `${SITE}/schedule/days-7/2026/10/26`,
      `${SITE}/schedule/days-7/2026/11/16`,
    ]);
    expect(result.pagesScanned).toBe(3);
  });

  it('leaves out the cursor page when the cursor is less than 7 days from this week', async () => {
    await runScheduleSync(makeDb({ cursor: '2026-10-22' }));
    expect(fetchedUrls()).toEqual([`${SITE}/schedule/days-7/2026/10/19`, `${SITE}/schedule/days-7/2026/10/26`]);
  });

  it('leaves out the cursor page when the cursor is less than 7 days from next week', async () => {
    await runScheduleSync(makeDb({ cursor: '2026-10-30' }));
    expect(fetchedUrls()).toEqual([`${SITE}/schedule/days-7/2026/10/19`, `${SITE}/schedule/days-7/2026/10/26`]);
  });

  it('fetches a cursor page exactly 7 days before this week (not "less than 7")', async () => {
    await runScheduleSync(makeDb({ cursor: '2026-10-12' }));
    expect(fetchedUrls()[2]).toBe(`${SITE}/schedule/days-7/2026/10/12`);
  });

  it('with no session, returns session_failed and fetches nothing', async () => {
    ensureSession.mockRejectedValue(new Error('no credentials'));
    const result = await runScheduleSync(makeDb());
    expect(result.action).toBe('session_failed');
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('a login page clears the session, enqueues nothing and leaves the cursor', async () => {
    authenticatedFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('<form>login password</form>') });
    const db = makeDb({ cursor: '2026-11-16' });
    const result = await runScheduleSync(db);
    expect(result.action).toBe('session_cleared');
    expect(clearSession).toHaveBeenCalledWith(db);
    expect(enqueue).not.toHaveBeenCalled();
    expect(db.calls.settingsUpdates).toEqual([]);
  });

  it('a page with "login" but no "password" is a schedule, not a login form', async () => {
    authenticatedFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('<a href="/login">log out</a>') });
    const result = await runScheduleSync(makeDb());
    expect(result.action).toBe('ok');
  });

  it('a non-OK HTTP status throws so the cron records a failure', async () => {
    authenticatedFetch.mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('') });
    await expect(runScheduleSync(makeDb())).rejects.toThrow('Schedule fetch failed: 503');
  });

  it('an appointment on two pages is counted and queued once', async () => {
    const both = link({ id: 'APPT1', title: '10/24-27' });
    servePages({ [`${SITE}/schedule/days-7/2026/10/19`]: both, [`${SITE}/schedule/days-7/2026/10/26`]: both });
    const result = await runScheduleSync(makeDb({ cursor: '2026-10-19' }));
    expect(result.found).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('a non-boarding title is skipped and counted; a boarding title is queued', async () => {
    servePages({ [`${SITE}/schedule/days-7/2026/10/19`]: link({ id: 'DAYCARE', title: 'DC FT' }) + link({ id: 'STAY', title: '10/24-27' }) });
    const result = await runScheduleSync(makeDb({ cursor: '2026-10-19' }));
    expect(result.skipped).toBe(1);
    expect(result.queued).toBe(1);
    expect(enqueue.mock.calls.map(([, item]) => item.external_id)).toEqual(['STAY']);
  });

  it('enqueues the ID, absolute URL, title and first pet ID', async () => {
    servePages({ [`${SITE}/schedule/days-7/2026/10/19`]: link({ id: 'STAY', ts: '1792836000', title: '10/24-27', pet: 'Dog A', petId: '10001' }) });
    const db = makeDb({ cursor: '2026-10-19' });
    await runScheduleSync(db);
    expect(enqueue).toHaveBeenCalledWith(db, {
      external_id: 'STAY',
      source_url: `${SITE}/schedule/a/STAY/1792836000`,
      title: '10/24-27',
      meta: { external_pet_id: '10001' },
    });
  });

  it('an untitled appointment is queued under its pet name, with no meta when it has no pet ID', async () => {
    servePages({ [`${SITE}/schedule/days-7/2026/10/19`]: link({ id: 'STAY', pet: 'Dog A' }) });
    await runScheduleSync(makeDb({ cursor: '2026-10-19' }));
    const [, item] = enqueue.mock.calls[0];
    expect(item.title).toBe('Dog A');
    expect(item.meta).toEqual({});
  });

  it('one failed enqueue does not stop the others, and only successes count as queued', async () => {
    servePages({ [`${SITE}/schedule/days-7/2026/10/19`]: link({ id: 'A', title: '10/24-27' }) + link({ id: 'B', title: '10/25-28' }) });
    enqueue.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(undefined);
    const result = await runScheduleSync(makeDb({ cursor: '2026-10-19' }));
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(result.found).toBe(2);
    expect(result.queued).toBe(1);
  });

  it("upserts every page's daytime events in one call and reports its counts", async () => {
    parseDaytimeSchedulePage.mockReturnValueOnce([{ id: 'd1' }]).mockReturnValueOnce([{ id: 'd2' }]).mockReturnValueOnce([{ id: 'd3' }]);
    upsertDaytimeAppointments.mockResolvedValue({ upserted: 2, errors: 1 });
    const db = makeDb({ cursor: '2026-11-16' });
    const result = await runScheduleSync(db);
    expect(upsertDaytimeAppointments).toHaveBeenCalledTimes(1);
    expect(upsertDaytimeAppointments).toHaveBeenCalledWith(db, [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }]);
    expect(result.daytimeUpserted).toBe(2);
    expect(result.daytimeErrors).toBe(1);
  });

  it('saves the cursor + 7 days on the existing settings row', async () => {
    const db = makeDb({ cursor: '2026-11-16' });
    const result = await runScheduleSync(db);
    expect(db.calls.settingsUpdates).toEqual([{ values: { schedule_cursor_date: '2026-11-23' }, col: 'id', val: 'settings-1' }]);
    expect(db.calls.settingsInserts).toEqual([]);
    expect(result.cursorAdvancedTo).toBe('2026-11-23');
  });

  it('with no settings row, starts the cursor at today and inserts today + 7 days', async () => {
    const db = makeDb({ hasSettingsRow: false });
    await runScheduleSync(db);
    expect(db.calls.settingsInserts).toEqual([{ schedule_cursor_date: '2026-10-26' }]);
    expect(db.calls.settingsUpdates).toEqual([]);
  });

  it('a cursor date is padded to YYYY-MM-DD', async () => {
    const db = makeDb({ cursor: '2026-12-01' });
    await runScheduleSync(db);
    expect(db.calls.settingsUpdates[0].values.schedule_cursor_date).toBe('2026-12-08');
  });

  it('returns ok with the pending queue depth', async () => {
    getQueueDepth.mockResolvedValue(7);
    const result = await runScheduleSync(makeDb({ cursor: '2026-10-19' }));
    expect(result.action).toBe('ok');
    expect(result.queueDepth).toBe(7);
  });
});

describe('REQ-109 parseScheduleHtml', () => {
  it('makes a relative appointment link absolute', () => {
    const [appt] = parseScheduleHtml(link({ id: 'X', ts: '123' }));
    expect(appt.url).toBe(`${SITE}/schedule/a/X/123`);
    expect(appt.timestamp).toBe('123');
  });

  it('keeps an absolute appointment link as it is', () => {
    const [appt] = parseScheduleHtml(link({ id: 'X', href: 'https://other.example.com/schedule/a/X/123' }));
    expect(appt.url).toBe('https://other.example.com/schedule/a/X/123');
  });

  it('ignores a link without a numeric timestamp', () => {
    expect(parseScheduleHtml(link({ id: 'X', href: '/schedule/a/X/edit' }))).toEqual([]);
  });

  it('reads trimmed client and time text', () => {
    const html = '<a href="/schedule/a/X/1"><span class="day-event-time"> 9:00 AM </span><span class="event-client"> Pat Example </span></a>';
    const [appt] = parseScheduleHtml(html);
    expect(appt.time).toBe('9:00 AM');
    expect(appt.clientName).toBe('Pat Example');
  });

  it('collects every data-pet ID in a link', () => {
    const html = '<a href="/schedule/a/X/1"><span data-pet="10001"></span><span data-pet="10002"></span></a>';
    expect(parseScheduleHtml(html)[0].petIds).toEqual(['10001', '10002']);
  });
});

describe('REQ-109 runDetailSync', () => {
  const appointmentItem = (over = {}) => ({
    id: 'q1', external_id: 'C63X', type: 'appointment', title: 'Dog A 10/24-27', retry_count: 0,
    source_url: `${SITE}/schedule/a/C63X/1792836000`, meta: { external_pet_id: '10001' }, ...over,
  });
  const formItem = (over = {}) => ({
    id: 'q1', external_id: 'form-b1', type: 'form', title: 'Dog A', retry_count: 0,
    source_url: `${SITE}/pets/10001/forms`, meta: { boarding_id: 'b1', external_pet_id: '10001' }, ...over,
  });
  const saved = (stats) => mapAndSaveAppointment.mockResolvedValue({
    stats: { syncCreated: false, syncUpdated: false, dogUpdated: false, boardingUpdated: false, ...stats },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ensureSession.mockResolvedValue('session=abc');
    resetStuck.mockResolvedValue(0);
    getQueueDepth.mockResolvedValue(4);
    fetchAppointmentDetails.mockResolvedValue({ external_id: 'C63X', pet_name: 'Dog A' });
    saved({});
  });

  it('with no session, returns session_failed before dequeuing anything', async () => {
    ensureSession.mockRejectedValue(new Error('no credentials'));
    const result = await runDetailSync(makeDb());
    expect(result.action).toBe('session_failed');
    expect(dequeueOne).not.toHaveBeenCalled();
  });

  it('a form item with no pet ID is marked done and skipped as no_pet_id', async () => {
    dequeueOne.mockResolvedValue(formItem({ meta: { boarding_id: 'b1' } }));
    const db = makeDb();
    const result = await runDetailSync(db);
    expect(result).toEqual({ action: 'skipped', reason: 'no_pet_id', externalId: 'form-b1', queueDepth: 4 });
    expect(markDone).toHaveBeenCalledWith(db, 'q1');
    expect(fetchAndStoreBoardingForm).not.toHaveBeenCalled();
  });

  it('a form item is fetched and stored for its boarding and pet, then marked done', async () => {
    dequeueOne.mockResolvedValue(formItem());
    const db = makeDb();
    const result = await runDetailSync(db);
    expect(fetchAndStoreBoardingForm).toHaveBeenCalledWith(db, 'b1', '10001', 'Dog A');
    expect(markDone).toHaveBeenCalledWith(db, 'q1');
    expect(result).toEqual({ action: 'form_stored', externalId: 'form-b1', queueDepth: 4 });
  });

  it('an expired session during a form fetch clears the session and puts the item back to pending', async () => {
    dequeueOne.mockResolvedValue(formItem());
    fetchAndStoreBoardingForm.mockRejectedValue(new Error('Session expired'));
    const db = makeDb();
    const result = await runDetailSync(db);
    expect(result).toEqual({ action: 'session_cleared', reason: 'session_expired' });
    expect(clearSession).toHaveBeenCalledWith(db);
    expect(db.calls.queueUpdates).toEqual([{ values: { status: 'pending', processing_started_at: null }, col: 'id', val: 'q1' }]);
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('any other form error marks the item failed', async () => {
    dequeueOne.mockResolvedValue(formItem());
    fetchAndStoreBoardingForm.mockRejectedValue(new Error('form page 500'));
    const db = makeDb();
    const result = await runDetailSync(db);
    expect(markFailed).toHaveBeenCalledWith(db, 'q1', 'form page 500');
    expect(result).toEqual({ action: 'form_failed', error: 'form page 500', externalId: 'form-b1', queueDepth: 4 });
    expect(markDone).not.toHaveBeenCalled();
  });

  it("an item with no type is an appointment, fetched by the ID and timestamp in its URL", async () => {
    dequeueOne.mockResolvedValue(appointmentItem({ type: undefined }));
    await runDetailSync(makeDb());
    expect(fetchAppointmentDetails).toHaveBeenCalledWith('C63X', '1792836000');
    expect(fetchAndStoreBoardingForm).not.toHaveBeenCalled();
  });

  it("an appointment whose URL doesn't match is fetched by its external_id with no timestamp", async () => {
    dequeueOne.mockResolvedValue(appointmentItem({ source_url: `${SITE}/somewhere/else` }));
    await runDetailSync(makeDb());
    expect(fetchAppointmentDetails).toHaveBeenCalledWith('C63X', '');
  });

  it('a missing pet name falls back to the queued title', async () => {
    dequeueOne.mockResolvedValue(appointmentItem());
    fetchAppointmentDetails.mockResolvedValue({ external_id: 'C63X', pet_name: null });
    await runDetailSync(makeDb());
    expect(mapAndSaveAppointment.mock.calls[0][0].pet_name).toBe('Dog A 10/24-27');
  });

  it("is saved with the item's pet ID and marked done", async () => {
    dequeueOne.mockResolvedValue(appointmentItem());
    const db = makeDb();
    await runDetailSync(db);
    expect(mapAndSaveAppointment).toHaveBeenCalledWith({ external_id: 'C63X', pet_name: 'Dog A' }, { supabase: db, externalPetId: '10001' });
    expect(markDone).toHaveBeenCalledWith(db, 'q1');
  });

  it('an item with no pet ID is saved with externalPetId null', async () => {
    dequeueOne.mockResolvedValue(appointmentItem({ meta: undefined }));
    await runDetailSync(makeDb());
    expect(mapAndSaveAppointment.mock.calls[0][1].externalPetId).toBeNull();
  });

  it('a new sync record is created', async () => {
    dequeueOne.mockResolvedValue(appointmentItem());
    saved({ syncCreated: true });
    expect(await runDetailSync(makeDb())).toEqual({ action: 'created', externalId: 'C63X', queueDepth: 4 });
  });

  it.each(['syncUpdated', 'dogUpdated', 'boardingUpdated'])('a %s change is updated', async (flag) => {
    dequeueOne.mockResolvedValue(appointmentItem());
    saved({ [flag]: true });
    expect((await runDetailSync(makeDb())).action).toBe('updated');
  });

  it('no change is unchanged', async () => {
    dequeueOne.mockResolvedValue(appointmentItem());
    expect((await runDetailSync(makeDb())).action).toBe('unchanged');
  });

  it('an expired session during a detail fetch puts the item back to pending, not failed', async () => {
    dequeueOne.mockResolvedValue(appointmentItem());
    fetchAppointmentDetails.mockRejectedValue(new Error('Session expired — please re-authenticate'));
    const db = makeDb();
    const result = await runDetailSync(db);
    expect(result).toEqual({ action: 'session_cleared', reason: 'session_expired' });
    expect(db.calls.queueUpdates).toEqual([{ values: { status: 'pending', processing_started_at: null }, col: 'id', val: 'q1' }]);
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('any other detail fetch error marks the item failed with the first 200 characters', async () => {
    dequeueOne.mockResolvedValue(appointmentItem());
    fetchAppointmentDetails.mockRejectedValue(new Error('x'.repeat(250)));
    const db = makeDb();
    const result = await runDetailSync(db);
    expect(markFailed).toHaveBeenCalledWith(db, 'q1', 'x'.repeat(200));
    expect(result).toEqual({ action: 'failed', error: 'x'.repeat(200), externalId: 'C63X', queueDepth: 4 });
    expect(mapAndSaveAppointment).not.toHaveBeenCalled();
  });

  it('a save error marks the item failed, not done', async () => {
    dequeueOne.mockResolvedValue(appointmentItem());
    mapAndSaveAppointment.mockRejectedValue(new Error('upsert conflict'));
    const db = makeDb();
    const result = await runDetailSync(db);
    expect(markFailed).toHaveBeenCalledWith(db, 'q1', 'upsert conflict');
    expect(markDone).not.toHaveBeenCalled();
    expect(result).toEqual({ action: 'save_failed', error: 'upsert conflict', externalId: 'C63X', queueDepth: 4 });
  });
});
