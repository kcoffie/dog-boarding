/**
 * A cancelled booking back on the booking site is un-cancelled by the detail step, only after its page
 * is read as a booking and saved (#316). A redirect leaves it cancelled.
 * @requirements REQ-108
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/scraper/auth.js', async (importOriginal) => ({ ...(await importOriginal()), setSession: vi.fn() }));
vi.mock('../../lib/scraper/siteAccess.js', async (importOriginal) => ({ ...(await importOriginal()), getSiteSession: vi.fn(async () => 'session=abc') }));
vi.mock('../../lib/scraper/syncQueue.js', async (importOriginal) => ({ ...(await importOriginal()), dequeueOne: vi.fn(), getQueueDepth: vi.fn(async () => 0) }));
vi.mock('../../lib/scraper/extraction.js', async (importOriginal) => ({ ...(await importOriginal()), fetchAppointmentDetails: vi.fn() }));
vi.mock('../../lib/scraper/mapping.js', async (importOriginal) => ({ ...(await importOriginal()), mapAndSaveAppointment: vi.fn() }));
vi.mock('../../lib/scraper/appointmentFilter.js', () => ({ applyDetailFilters: vi.fn(() => ({ skip: false })) }));

import { runDetailSync } from '../../lib/scraper/syncRunner.js';
import { dequeueOne } from '../../lib/scraper/syncQueue.js';
import { fetchAppointmentDetails } from '../../lib/scraper/extraction.js';
import { mapAndSaveAppointment } from '../../lib/scraper/mapping.js';
import { DetailRedirected } from '../../lib/scraper/redirects.js';
import { applyDetailFilters } from '../../lib/scraper/appointmentFilter.js';
import { createFakeSupabase } from './fakeSupabase.js';

const URL = 'https://agirlandyourdog.com/schedule/a/BKBACK01/1793721600';

function setUp({ restore = true } = {}) {
  const db = createFakeSupabase();
  db._addSyncAppointment({ external_id: 'BKBACK01', sync_status: 'archived', check_in_datetime: '2026-11-03T16:00:00+00:00', check_out_datetime: '2026-11-12T17:00:00+00:00' });
  for (const id of ['BKBACK01', 'BKBACK01_p1']) {
    db._addBoarding({ external_id: id, dog_id: `dog-${id}`, cancelled_at: '2026-10-29T00:10:00Z', cancellation_reason: 'appointment_archived',
      arrival_datetime: '2026-11-03T16:00:00+00:00', departure_datetime: '2026-11-12T17:00:00+00:00' });
  }
  const item = db._addQueueItem({ external_id: 'BKBACK01', source_url: URL, title: '11/3-12', status: 'processing', type: 'appointment', meta: restore ? { restore: true } : {} });
  dequeueOne.mockResolvedValue({ ...item });
  return db;
}
const reasons = (db) => db._mockData.boardings.map((b) => b.cancellation_reason ?? null);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchAppointmentDetails.mockResolvedValue({ external_id: 'BKBACK01', pets: [{ id: '40001', name: 'Dog A' }], pet_name: 'Dog A' });
  mapAndSaveAppointment.mockResolvedValue({ stats: { syncUpdated: true }, notices: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('REQ-108: the detail step restores a cancelled booking that is back (#316)', () => {
  it("read and saved: both dogs' cancellations cleared, the booking active, Kate told, the restore mark dropped", async () => {
    const db = setUp();
    const result = await runDetailSync(db, { runResetStuck: false });
    expect(reasons(db)).toEqual([null, null]);
    expect(db._mockData.sync_appointments[0].sync_status).toBe('active');
    expect(result.notice).toBe('BKBACK01 "11/3-12": back on the booking site, so its cancellation was cleared');
    const item = db._mockData.sync_queue[0];
    expect([item.status, item.meta.restore]).toEqual(['done', undefined]);
  });

  it('its page redirects to /schedule: it stays cancelled', async () => {
    const db = setUp();
    fetchAppointmentDetails.mockRejectedValue(new DetailRedirected('schedule', 'https://agirlandyourdog.com/schedule'));
    await runDetailSync(db, { runResetStuck: false });
    expect(reasons(db)).toEqual(['appointment_archived', 'appointment_archived']);
    expect(db._mockData.sync_appointments[0].sync_status).toBe('archived');
    const meta = db._mockData.sync_queue[0].meta;
    expect([meta.restore, meta.restore_blocked]).toEqual([undefined, URL]);
  });

  it('its page has no dates: no restore, and blocked at this URL', async () => {
    const db = setUp();
    mapAndSaveAppointment.mockResolvedValue({ stats: {}, notices: [], skipped: 'dateless_page' });
    await runDetailSync(db, { runResetStuck: false });
    expect(reasons(db)).toEqual(['appointment_archived', 'appointment_archived']);
    const meta = db._mockData.sync_queue[0].meta;
    expect([meta.restore, meta.restore_blocked]).toEqual([undefined, URL]);
  });

  it("it's no longer a boarding (skipped): no restore, and blocked at this URL", async () => {
    const db = setUp();
    applyDetailFilters.mockReturnValueOnce({ skip: true, reason: 'same_day' });
    await runDetailSync(db, { runResetStuck: false });
    expect(reasons(db)).toEqual(['appointment_archived', 'appointment_archived']);
    const meta = db._mockData.sync_queue[0].meta;
    expect([meta.restore, meta.restore_blocked, meta.detail_skip]).toEqual([undefined, URL, 'same_day']);
  });

  it('a restore mark on a booking that is active (not cancelled by the sync) does nothing and says nothing', async () => {
    const db = setUp();
    db._mockData.sync_appointments[0].sync_status = 'active';
    const result = await runDetailSync(db, { runResetStuck: false });
    expect([reasons(db), result.notice, db._mockData.sync_queue[0].meta]).toEqual([['appointment_archived', 'appointment_archived'], null, {}]);
  });

  it('the save fails: it stays cancelled and the item keeps its restore mark for the retry', async () => {
    const db = setUp();
    mapAndSaveAppointment.mockRejectedValue(new Error('db down'));
    await runDetailSync(db, { runResetStuck: false });
    expect(reasons(db)).toEqual(['appointment_archived', 'appointment_archived']);
    expect(db._mockData.sync_queue[0].meta.restore).toBe(true);
  });

  it('a normal read of a booking (no restore mark) un-cancels nothing', async () => {
    const db = setUp({ restore: false });
    const result = await runDetailSync(db, { runResetStuck: false });
    expect(reasons(db)).toEqual(['appointment_archived', 'appointment_archived']);
    expect(result.notice).toBeNull();
  });

  it("its dog already has another booking on those dates: it stays cancelled and Kate is told which", async () => {
    const db = setUp();
    db._addBoarding({ external_id: 'BKNEW001', dog_id: 'dog-BKBACK01', cancelled_at: null, arrival_datetime: '2026-11-05T10:00:00+00:00', departure_datetime: '2026-11-08T16:15:00+00:00' });
    db._addBoarding({ external_id: 'BKNEW002', dog_id: 'dog-BKBACK01_p1', cancelled_at: null, arrival_datetime: '2026-11-05T10:00:00+00:00', departure_datetime: '2026-11-08T16:15:00+00:00' });
    const result = await runDetailSync(db, { runResetStuck: false });
    expect(result.notice).toBe('BKBACK01 "11/3-12": back on the booking site, but its dog(s) already have BKNEW001, BKNEW002 on those dates, so it stays cancelled');
    expect(db._mockData.sync_appointments[0].sync_status).toBe('archived');
    expect(db._mockData.sync_queue[0].meta).toEqual({ restore_blocked: URL });
  });

  it('the restore mark is dropped but the rest of the item\'s meta is kept', async () => {
    const db = setUp();
    db._mockData.sync_queue[0].meta = { restore: true, schedule_pet_ids: ['40001'] };
    dequeueOne.mockResolvedValue({ ...db._mockData.sync_queue[0] });
    await runDetailSync(db, { runResetStuck: false });
    expect(db._mockData.sync_queue[0].meta).toEqual({ schedule_pet_ids: ['40001'] });
  });

  it('an item with no title still gets its notice', async () => {
    const db = setUp();
    dequeueOne.mockResolvedValue({ ...db._mockData.sync_queue[0], title: null });
    const result = await runDetailSync(db, { runResetStuck: false });
    expect(result.notice).toBe('BKBACK01 "": back on the booking site, so its cancellation was cleared');
  });

  it("a page notice and the restore notice are both kept", async () => {
    const db = setUp();
    mapAndSaveAppointment.mockResolvedValue({ stats: {}, notices: ['pet 40002 not identified'] });
    const result = await runDetailSync(db, { runResetStuck: false });
    expect(result.notice).toBe('BKBACK01 "11/3-12": pet 40002 not identified; BKBACK01 "11/3-12": back on the booking site, so its cancellation was cleared');
  });
});
