/**
 * A booking removed on the booking site is cancelled by the nightly sync (#316). The nightly scan reads
 * this week's and next week's pages; a stored booking in those two weeks that's on neither, and whose
 * page answers 302 → /schedule, has every dog's boarding cancelled. A cancelled booking seen on the
 * site again is re-read and un-cancelled. Every outcome goes in one alert a night.
 * Expected values are worked out by hand. Booking times are site clock values (ADR-009), stored as
 * Supabase returns them ("…+00:00").
 * @requirements REQ-108
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/scraper/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  authenticatedFetch: vi.fn(),
}));
vi.mock('../../lib/alertKate.js', () => ({ alertAndLog: vi.fn(async () => true) }));

import { reconcileScheduleWindow, alertReconcile, RECONCILE_ALERT_JOB, RECONCILE_LIVE_FROM } from '../../lib/scraper/syncRunner.js';
import { restoreArchivedBooking } from '../../lib/scraper/reconcile.js';
import { requeueForRestore } from '../../lib/scraper/syncQueue.js';
import { authenticatedFetch, SiteThrottled } from '../../lib/scraper/auth.js';
import { alertAndLog } from '../../lib/alertKate.js';
import { createFakeSupabase } from './fakeSupabase.js';

const SITE = 'https://agirlandyourdog.com';
const url = (id) => `${SITE}/schedule/a/${id}/1793721600`;
const gone = () => ({ status: 302, headers: { get: (h) => (h.toLowerCase() === 'location' ? `${SITE}/schedule` : null) }, text: async () => '' });
const live = () => ({ status: 200, headers: { get: () => null }, text: async () => '<div data-start_scheduled="1793721600"></div>' });
const answers = (byId) => authenticatedFetch.mockImplementation(async (u) => {
  const id = Object.keys(byId).find((k) => u === url(k));
  if (!id) throw new Error(`unexpected page load ${u}`);
  return byId[id]();
});

// Tonight's pages: Tue 10-27 (the week of Sun 10-25) and Tue 11-03 (the week of Sun 11-01), as the
// runner passes them (local calendar dates). So the window is Sun 10-25 to Sun 11-08.
const PAGES = [new Date(2026, 9, 27), new Date(2026, 10, 3)];
// The cron at 00:05 UTC on 10-29 is 5:05pm on 10-28 in San Francisco: on or after RECONCILE_LIVE_FROM
const LIVE_NIGHT = new Date('2026-10-29T00:05:00Z');
// The night before, 5:05pm on 10-27 in San Francisco: report only
const FIRST_NIGHT = new Date('2026-10-28T00:05:00Z');

function booking(db, id, checkIn, checkOut, extra = {}) {
  db._addSyncAppointment({
    external_id: id, source_url: url(id), service_type: `${id} title`, pet_name: 'Dog A',
    check_in_datetime: checkIn, check_out_datetime: checkOut, sync_status: 'active', ...extra,
  });
}
const boardingRow = (db, externalId, extra = {}) => db._addBoarding({
  external_id: externalId, dog_id: `dog-${externalId}`, cancelled_at: null, cancellation_reason: null,
  booking_status: 'confirmed', arrival_datetime: '2026-11-03T16:00:00+00:00', departure_datetime: '2026-11-12T17:00:00+00:00', ...extra,
});
const syncRow = (db, id) => db._mockData.sync_appointments.find((r) => r.external_id === id);
const boardingOf = (db, externalId) => db._mockData.boardings.find((b) => b.external_id === externalId);
const night = (db, { seen = [], appointments = [], pageCounts = [12, 9], pageDates = PAGES, now = LIVE_NIGHT } = {}) =>
  reconcileScheduleWindow(db, { seenIds: new Set(seen), appointments, pageDates, pageCounts, now });
const opened = () => authenticatedFetch.mock.calls.map(([u]) => u.split('/')[5]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('REQ-108: the nightly check cancels a booking removed from the booking site (#316)', () => {
  it("a two-dog booking on neither page whose page answers 302 → /schedule: both dogs' boardings cancelled, the booking archived", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKGONE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    boardingRow(db, 'BKGONE01');
    boardingRow(db, 'BKGONE01_p1');
    answers({ BKGONE01: gone });

    const rec = await night(db);

    expect([boardingOf(db, 'BKGONE01').cancellation_reason, boardingOf(db, 'BKGONE01_p1').cancellation_reason])
      .toEqual(['appointment_archived', 'appointment_archived']);
    expect(syncRow(db, 'BKGONE01').sync_status).toBe('archived');
    expect([rec.mode, rec.archived]).toEqual(['live', 1]);
    expect(rec.gone).toEqual([{ external_id: 'BKGONE01', service_type: 'BKGONE01 title', pet_name: 'Dog A',
      check_in_datetime: '2026-11-03T16:00:00+00:00', check_out_datetime: '2026-11-12T17:00:00+00:00', dogs: 2 }]);
  });

  it("another booking whose ID starts with this one's is left alone", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKGONE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    boardingRow(db, 'BKGONE01');
    boardingRow(db, 'BKGONE01X');
    answers({ BKGONE01: gone });
    await night(db);
    expect(boardingOf(db, 'BKGONE01X').cancelled_at).toBeNull();
  });

  it('a booking whose page still opens is not cancelled, and is listed as present', async () => {
    const db = createFakeSupabase();
    booking(db, 'BKLIVE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    boardingRow(db, 'BKLIVE01');
    answers({ BKLIVE01: live });
    const rec = await night(db);
    expect([boardingOf(db, 'BKLIVE01').cancelled_at, syncRow(db, 'BKLIVE01').sync_status, rec.present]).toEqual([null, 'active', ['BKLIVE01']]);
  });

  it('a booking seen on any page tonight, the cursor week included, is never opened', async () => {
    const db = createFakeSupabase();
    booking(db, 'BKSEEN01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    const rec = await night(db, { seen: ['BKSEEN01'] });
    expect([authenticatedFetch.mock.calls.length, rec.candidates]).toEqual([0, 0]);
  });

  it('the window is the two pages read: from the Monday after their first Sunday (10-26) to before Sun 11-08', async () => {
    const db = createFakeSupabase();
    booking(db, 'ENDSSUN', '2026-10-20T10:00:00+00:00', '2026-10-25T16:15:00+00:00'); // ended Sunday 10-25
    booking(db, 'ENDSMON', '2026-10-20T10:00:00+00:00', '2026-10-26T00:00:00+00:00'); // a title-only Monday
    booking(db, 'STARTSAT', '2026-11-07T10:00:00+00:00', '2026-11-10T16:15:00+00:00'); // Saturday 11-07
    booking(db, 'STARTSUN', '2026-11-08T00:00:00+00:00', '2026-11-10T16:15:00+00:00'); // Sunday 11-08
    answers({ ENDSMON: live, STARTSAT: live });
    await night(db);
    expect(opened()).toEqual(['ENDSMON', 'STARTSAT']);
  });

  for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    it(`the window is the same with the host in ${zone}`, async () => {
      const before = process.env.TZ;
      process.env.TZ = zone;
      try {
        // Where the zone can't be switched (Stryker's threads), the host's own zone runs: same answer
        const db = createFakeSupabase();
        booking(db, 'ENDSSUN', '2026-10-20T10:00:00+00:00', '2026-10-25T16:15:00+00:00');
        booking(db, 'STARTSAT', '2026-11-07T10:00:00+00:00', '2026-11-10T16:15:00+00:00');
        booking(db, 'STARTSUN', '2026-11-08T00:00:00+00:00', '2026-11-10T16:15:00+00:00');
        answers({ STARTSAT: live });
        await night(db, { pageDates: [new Date(2026, 9, 27), new Date(2026, 10, 3)] });
        expect(opened()).toEqual(['STARTSAT']);
      } finally {
        if (before === undefined) delete process.env.TZ;
        else process.env.TZ = before;
      }
    });
  }

  it("a page that showed no bookings: nothing is checked, and the alert says so", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKGONE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    const rec = await night(db, { pageCounts: [12, 0] });
    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(rec).toEqual({ mode: 'live', candidates: 0, present: [], gone: [], archived: 0, restores: [], skipped: "Not checked: this week's or next week's page showed no bookings", errors: 0 });
  });

  it("this week's page showed no bookings: nothing is checked either", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKGONE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    const rec = await night(db, { pageCounts: [0, 9] });
    expect([authenticatedFetch.mock.calls.length, rec.skipped]).toEqual([0, "Not checked: this week's or next week's page showed no bookings"]);
  });

  it("the cancelled bookings seen again can't be looked up: an error, and the window is still checked", async () => {
    const db = createFakeSupabase({ failOn: (table, op, filters) => (table === 'sync_appointments' && filters.some(([o]) => o === 'in') ? { message: 'boom' } : null) });
    booking(db, 'BKLIVE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    answers({ BKLIVE01: live });
    const rec = await night(db);
    expect([rec.errors, rec.present]).toEqual([1, ['BKLIVE01']]);
  });

  it("pages that aren't consecutive weeks: nothing is checked", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKGONE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    const rec = await night(db, { pageDates: [new Date(2026, 9, 27), new Date(2026, 10, 10)] });
    expect([authenticatedFetch.mock.calls.length, rec.skipped]).toEqual([0, "Not checked: this week's and next week's pages weren't consecutive weeks"]);
  });

  it('a 429 stops the run: SiteThrottled is thrown and nothing is cancelled', async () => {
    const db = createFakeSupabase();
    booking(db, 'BKGONE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    boardingRow(db, 'BKGONE01');
    authenticatedFetch.mockRejectedValue(new SiteThrottled(429));
    await expect(night(db)).rejects.toBeInstanceOf(SiteThrottled);
    expect(boardingOf(db, 'BKGONE01').cancelled_at).toBeNull();
  });

  it("the bookings to check can't be read: a stop and an error, both reported", async () => {
    const db = createFakeSupabase({ failOn: (table, op) => (table === 'sync_appointments' && op === 'select' ? { message: 'boom' } : null) });
    const rec = await night(db);
    expect([rec.skipped, rec.errors]).toEqual(["Reconciliation stopped: the bookings to check couldn't be read (boom)", 2]);
  });
});

describe('REQ-108: the first night only reports (Kate, Q5)', () => {
  it(`before ${RECONCILE_LIVE_FROM} in San Francisco a removed booking is listed but nothing is cancelled`, async () => {
    const db = createFakeSupabase();
    booking(db, 'BKGONE01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00');
    boardingRow(db, 'BKGONE01');
    answers({ BKGONE01: gone });
    const rec = await night(db, { now: FIRST_NIGHT });
    expect([rec.mode, rec.gone.map((g) => g.external_id), rec.archived]).toEqual(['report_only', ['BKGONE01'], 0]);
    expect([boardingOf(db, 'BKGONE01').cancelled_at, syncRow(db, 'BKGONE01').sync_status]).toEqual([null, 'active']);
  });

  it('the first night lists a cancelled booking seen again but queues nothing', async () => {
    const db = createFakeSupabase();
    booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
    const rec = await night(db, { now: FIRST_NIGHT, seen: ['BKBACK01'], appointments: [{ id: 'BKBACK01', url: url('BKBACK01'), title: 'back' }] });
    expect([rec.restores, db._mockData.sync_queue.length]).toEqual([['BKBACK01'], 0]);
  });
});

describe('REQ-108: a cancelled booking back on the booking site is restored only on proof (#316)', () => {
  it('seen on a page again: re-queued with its current URL, to be read and restored', async () => {
    const db = createFakeSupabase();
    booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
    db._addQueueItem({ external_id: 'BKBACK01', source_url: `${SITE}/schedule/a/BKBACK01/1`, status: 'done', type: 'appointment', meta: {} });
    const rec = await night(db, { seen: ['OTHER001', 'BKBACK01'], appointments: [
      { id: 'OTHER001', url: url('OTHER001'), title: 'other' },
      { id: 'BKBACK01', url: url('BKBACK01'), title: 'back' },
    ] });
    const item = db._mockData.sync_queue[0];
    expect([rec.restores, item.status, item.source_url, item.title, item.type, item.meta.restore]).toEqual([['BKBACK01'], 'pending', url('BKBACK01'), 'back', 'appointment', true]);
  });

  it("restoring clears both dogs' cancellations and makes the booking active; booking_status is untouched", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
    boardingRow(db, 'BKBACK01', { cancelled_at: '2026-10-29T00:10:00Z', cancellation_reason: 'appointment_archived', booking_status: 'pending' });
    boardingRow(db, 'BKBACK01_p1', { cancelled_at: '2026-10-29T00:10:00Z', cancellation_reason: 'appointment_archived' });

    const result = await restoreArchivedBooking(db, 'BKBACK01');

    expect(result).toEqual({ restored: true, boardings: 2, conflicts: [] });
    const b = boardingOf(db, 'BKBACK01');
    expect([b.cancelled_at, b.cancellation_reason, b.booking_status, boardingOf(db, 'BKBACK01_p1').cancelled_at]).toEqual([null, null, 'pending', null]);
    expect([syncRow(db, 'BKBACK01').sync_status, syncRow(db, 'BKBACK01').last_change_type]).toEqual(['active', 'restored']);
  });

  it("its own dog's other boarding of the same booking, never cancelled, doesn't block it", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
    boardingRow(db, 'BKBACK01', { dog_id: 'dog-1', cancelled_at: '2026-10-29T00:10:00Z' });
    boardingRow(db, 'BKBACK01_p1', { dog_id: 'dog-1' });
    expect((await restoreArchivedBooking(db, 'BKBACK01')).restored).toBe(true);
  });

  it("another boarding over the same dates that's cancelled itself doesn't block it", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
    boardingRow(db, 'BKBACK01', { dog_id: 'dog-1', cancelled_at: '2026-10-29T00:10:00Z' });
    boardingRow(db, 'BKOTHER1', { dog_id: 'dog-1', cancelled_at: '2026-10-20T00:10:00Z' });
    expect((await restoreArchivedBooking(db, 'BKBACK01')).restored).toBe(true);
  });

  it("a boarding of the same dog that starts when this one ends doesn't count as overlapping", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
    boardingRow(db, 'BKBACK01', { dog_id: 'dog-1', cancelled_at: '2026-10-29T00:10:00Z' });
    boardingRow(db, 'BKNEXT01', { dog_id: 'dog-1', arrival_datetime: '2026-11-12T17:00:00+00:00', departure_datetime: '2026-11-15T16:15:00+00:00' });
    expect((await restoreArchivedBooking(db, 'BKBACK01')).restored).toBe(true);
  });

  for (const [what, failOn] of [
    ["its dogs' boardings can't be read", (t, op, f) => (t === 'boardings' && op === 'select' && f.some(([o]) => o === 'is') ? { message: 'boom' } : null)],
    ["a boarding can't be un-cancelled", (t, op) => (t === 'boardings' && op === 'update' ? { message: 'boom' } : null)],
    ["the booking can't be made active", (t, op) => (t === 'sync_appointments' && op === 'update' ? { message: 'boom' } : null)],
  ]) {
    it(`${what}: the restore fails loudly (the detail step retries it)`, async () => {
      const db = createFakeSupabase({ failOn });
      booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
      boardingRow(db, 'BKBACK01', { cancelled_at: '2026-10-29T00:10:00Z' });
      await expect(restoreArchivedBooking(db, 'BKBACK01')).rejects.toEqual({ message: 'boom' });
    });
  }

  it('not when its dog already has another live boarding over those dates: left cancelled, the conflict named', async () => {
    const db = createFakeSupabase();
    booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
    boardingRow(db, 'BKBACK01', { dog_id: 'dog-1', cancelled_at: '2026-10-29T00:10:00Z', cancellation_reason: 'appointment_archived' });
    boardingRow(db, 'BKNEW001', { dog_id: 'dog-1', arrival_datetime: '2026-11-10T10:00:00+00:00', departure_datetime: '2026-11-14T16:15:00+00:00' });

    const result = await restoreArchivedBooking(db, 'BKBACK01');

    expect(result).toEqual({ restored: false, boardings: 1, conflicts: ['BKNEW001'] });
    expect([boardingOf(db, 'BKBACK01').cancellation_reason, syncRow(db, 'BKBACK01').sync_status]).toEqual(['appointment_archived', 'archived']);
  });

  it("a boarding of the same dog that ends when this one starts doesn't count as overlapping", async () => {
    const db = createFakeSupabase();
    booking(db, 'BKBACK01', '2026-11-03T16:00:00+00:00', '2026-11-12T17:00:00+00:00', { sync_status: 'archived' });
    boardingRow(db, 'BKBACK01', { dog_id: 'dog-1', cancelled_at: '2026-10-29T00:10:00Z' });
    boardingRow(db, 'BKOLD001', { dog_id: 'dog-1', arrival_datetime: '2026-10-30T10:00:00+00:00', departure_datetime: '2026-11-03T16:00:00+00:00' });
    expect((await restoreArchivedBooking(db, 'BKBACK01')).restored).toBe(true);
  });

  it('a queue item being processed is left alone; a booking with no item gets one', async () => {
    const db = createFakeSupabase();
    db._addQueueItem({ external_id: 'BKBUSY01', source_url: url('BKBUSY01'), status: 'processing', meta: {} });
    expect(await requeueForRestore(db, { external_id: 'BKBUSY01', source_url: url('BKBUSY01') })).toBe('in_flight');
    expect(await requeueForRestore(db, { external_id: 'BKNEW002', source_url: url('BKNEW002') })).toBe('queued');
    const added = db._mockData.sync_queue.find((q) => q.external_id === 'BKNEW002');
    expect([added.status, added.type, added.title, added.meta]).toEqual(['pending', 'appointment', '', { restore: true }]);
  });

  it("a done item is re-queued ('requeued'), keeping its other meta", async () => {
    const db = createFakeSupabase();
    db._addQueueItem({ external_id: 'BKBACK01', source_url: url('BKBACK01'), status: 'done', type: 'appointment', meta: { schedule_pet_ids: ['1'] } });
    expect(await requeueForRestore(db, { external_id: 'BKBACK01', source_url: url('BKBACK01'), title: 't' })).toBe('requeued');
    expect(db._mockData.sync_queue[0].meta).toEqual({ schedule_pet_ids: ['1'], restore: true });
  });

  for (const op of ['select', 'update', 'insert']) {
    it(`a failed queue ${op} throws`, async () => {
      const db = createFakeSupabase({ failOn: (t, o) => (t === 'sync_queue' && o === op ? { message: 'boom' } : null) });
      if (op === 'update') db._addQueueItem({ external_id: 'BKBACK01', source_url: url('BKBACK01'), status: 'done', meta: {} });
      await expect(requeueForRestore(db, { external_id: 'BKBACK01', source_url: url('BKBACK01') })).rejects.toEqual({ message: 'boom' });
    });
  }
});

describe('REQ-108: one alert a night with anything to say (Kate, 2026-10-26)', () => {
  const base = { mode: 'live', candidates: 0, present: [], gone: [], archived: 0, restores: [], skipped: null, errors: 0 };
  const sent = () => alertAndLog.mock.calls[0]?.[2];

  it('a quiet night sends nothing', async () => {
    expect(await alertReconcile({}, base)).toBeNull();
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('a cancelled booking is named with its title, dog, dates and number of dogs, as job sync-reconcile', async () => {
    const delivered = await alertReconcile({}, { ...base, gone: [{ external_id: 'BKGONE01', service_type: '11/3pm-12', pet_name: 'Dog A', check_in_datetime: '2026-11-03T16:00:00+00:00', check_out_datetime: '2026-11-12T17:00:00+00:00', dogs: 2 }] });
    expect(delivered).toBe(true);
    expect(alertAndLog.mock.calls[0][1]).toBe(RECONCILE_ALERT_JOB);
    expect(RECONCILE_ALERT_JOB).toBe('sync-reconcile');
    expect(sent()).toBe('🗑️ Q Boarding sync, removed bookings\n• Cancelled BKGONE01 "11/3pm-12" (Dog A), 11/3 → 11/12, 2 dog(s): removed on the booking site, or moved outside the next two weeks');
  });

  it('the first night says nothing changed and "Would cancel"', async () => {
    await alertReconcile({}, { ...base, mode: 'report_only', gone: [{ external_id: 'BKGONE01', service_type: 't', pet_name: null, check_in_datetime: '2026-11-03T16:00:00+00:00', check_out_datetime: '2026-11-12T17:00:00+00:00', dogs: 0 }] });
    expect(sent()).toBe('🔎 Q Boarding sync, removed bookings (report only: nothing changed tonight)\n• Would cancel BKGONE01 "t", 11/3 → 11/12: removed on the booking site, or moved outside the next two weeks');
  });

  it('re-reads, present bookings, a stop and errors each get a line', async () => {
    await alertReconcile({}, { ...base, restores: ['BKBACK01', 'BKBACK02'], present: ['BKLIVE01', 'BKLIVE02'], skipped: 'Reconciliation stopped: x', errors: 1 });
    expect(sent().split('\n')).toEqual([
      '🗑️ Q Boarding sync, removed bookings',
      '• Re-reading 2 cancelled booking(s) seen on the site again, to restore them: BKBACK01, BKBACK02',
      "• 2 booking(s) missing from this week's and next week's pages, but their page still opens (not cancelled; the schedule reader may be missing bookings): BKLIVE01, BKLIVE02",
      '• Reconciliation stopped: x',
      "• 1 error(s) while checking: see the schedule cron's log",
    ]);
  });

  it('the first night says "Would re-read"', async () => {
    await alertReconcile({}, { ...base, mode: 'report_only', restores: ['BKBACK01'] });
    expect(sent().split('\n')[1]).toBe('• Would re-read 1 cancelled booking(s) seen on the site again, to restore them: BKBACK01');
  });

  it('a booking with no title or dates still gets a line', async () => {
    await alertReconcile({}, { ...base, gone: [{ external_id: 'BKGONE02', service_type: null, pet_name: null, check_in_datetime: null, check_out_datetime: null, dogs: 1 }] });
    expect(sent().split('\n')[1]).toBe('• Cancelled BKGONE02 "", ? → ?, 1 dog(s): removed on the booking site, or moved outside the next two weeks');
  });

  it('an alert that was not delivered is reported back as false', async () => {
    alertAndLog.mockResolvedValueOnce(false);
    expect(await alertReconcile({}, { ...base, errors: 1 })).toBe(false);
  });
});
