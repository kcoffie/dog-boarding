/**
 * Sync Now (runSync) stops safely: an empty schedule and a 429/403 end the run before
 * reconciliation, and a stopped reconciliation is reported (#324).
 * A booking page that redirected or had no dates is skipped, not failed, and nothing is written (#344).
 * @requirements REQ-657, REQ-660
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/scraper/auth.js', async (importOriginal) => ({
  SiteThrottled: (await importOriginal()).SiteThrottled,
  authenticate: vi.fn(),
  isAuthenticated: vi.fn(() => true),
  resetSiteStop: vi.fn(),
}));
vi.mock('../../lib/scraper/schedule.js', () => ({ fetchAllSchedulePages: vi.fn() }));
vi.mock('../../lib/scraper/extraction.js', async (importOriginal) => ({
  fetchAppointmentDetails: vi.fn(),
  nameFromTitle: (await importOriginal()).nameFromTitle,
}));
vi.mock('../../lib/scraper/appointmentFilter.js', () => ({ applyDetailFilters: vi.fn(() => ({ skip: false })) }));
vi.mock('../../lib/scraper/mapping.js', () => ({ mapAndSaveAppointment: vi.fn() }));
vi.mock('../../lib/scraper/reconcile.js', () => ({ reconcileArchivedAppointments: vi.fn() }));
vi.mock('../../lib/scraper/forms.js', () => ({ fetchAndStoreBoardingForm: vi.fn(), formJobPetMatches: vi.fn(async () => true) }));
vi.mock('../../lib/scraper/syncQueue.js', () => ({ dequeueOne: vi.fn(), markDone: vi.fn(), markFailed: vi.fn() }));
vi.mock('../../lib/scraper/syncSettingsRow.js', () => ({ readSettingsRow: vi.fn(async () => ({ id: 1 })) }));
vi.mock('../../lib/scraper/logger.js', () => ({
  syncLogger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logSyncStart: vi.fn(),
  logSyncEnd: vi.fn(),
}));

import { runSync } from '../../lib/scraper/sync.js';
import { syncLogger } from '../../lib/scraper/logger.js';
import { DetailRedirected } from '../../lib/scraper/redirects.js';
import { SiteThrottled, resetSiteStop } from '../../lib/scraper/auth.js';
import { fetchAllSchedulePages } from '../../lib/scraper/schedule.js';
import { fetchAppointmentDetails } from '../../lib/scraper/extraction.js';
import { mapAndSaveAppointment } from '../../lib/scraper/mapping.js';
import { reconcileArchivedAppointments } from '../../lib/scraper/reconcile.js';
import { dequeueOne, markDone, markFailed } from '../../lib/scraper/syncQueue.js';
import { fetchAndStoreBoardingForm, formJobPetMatches } from '../../lib/scraper/forms.js';

// Every query resolves to an empty list; inserts return a sync log row. Records each sync_logs update.
function makeDb() {
  const logUpdates = [];
  const settingsUpdates = [];
  const chain = (table) => {
    const c = {
      select: () => c, insert: () => c, eq: () => c, lt: () => c, in: () => c, order: () => c, limit: () => c,
      update: (values) => {
        if (table === 'sync_logs') logUpdates.push(values);
        if (table === 'sync_settings') settingsUpdates.push(values);
        return c;
      },
      single: async () => ({ data: { id: 'log-1' }, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return c;
  };
  return { from: chain, logUpdates, settingsUpdates };
}

const appt = (id) => ({ id, title: '10/24-27', url: `https://agirlandyourdog.com/schedule/a/${id}/1`, petIds: [] });

describe('REQ-657: Sync Now stops safely', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchAppointmentDetails.mockResolvedValue({ pet_name: 'Dog A', pets: [{ id: '10001', name: 'Dog A' }], check_in_datetime: '2026-10-24T17:00:00Z' });
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: true }, notices: [] });
    reconcileArchivedAppointments.mockResolvedValue({ archived: 0, warnings: 0, errors: 0, skipped: null });
    dequeueOne.mockResolvedValue(null);
  });

  it('starts a new run: an earlier run\'s 429/403 stop is reset', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    await runSync({ supabase: makeDb() });
    expect(resetSiteStop).toHaveBeenCalledTimes(1);
  });

  it('0 appointments on the schedule fails the run before any detail fetch or reconciliation', async () => {
    fetchAllSchedulePages.mockResolvedValue([]);
    await expect(runSync({ supabase: makeDb() })).rejects.toThrow('The schedule showed 0 appointments: stopping before anything else');
    expect(fetchAppointmentDetails).not.toHaveBeenCalled();
    expect(reconcileArchivedAppointments).not.toHaveBeenCalled();
  });

  it('a 429 on one booking ends the run: no later booking, no reconciliation, no form drain', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A'), appt('B'), appt('C')]);
    fetchAppointmentDetails
      .mockResolvedValueOnce({ pet_name: 'Dog A', pets: [{ id: '10001', name: 'Dog A' }], check_in_datetime: '2026-10-24T17:00:00Z' })
      .mockRejectedValueOnce(new SiteThrottled(429));
    const db = makeDb();
    await expect(runSync({ supabase: db })).rejects.toThrow('Booking site answered 429: stopping this run');
    expect(fetchAppointmentDetails).toHaveBeenCalledTimes(2);
    expect(reconcileArchivedAppointments).not.toHaveBeenCalled();
    expect(dequeueOne).not.toHaveBeenCalled();
    expect(db.logUpdates.at(-1).status).toBe('failed');
  });

  it('a 429 during reconciliation ends the run before the form drain', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    reconcileArchivedAppointments.mockRejectedValue(new SiteThrottled(403));
    await expect(runSync({ supabase: makeDb() })).rejects.toThrow('Booking site answered 403: stopping this run');
    expect(dequeueOne).not.toHaveBeenCalled();
  });

  it("Sync Now's form drain skips a job for another pet than its boarding's dog, and fetches the next (#344)", async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    const form = (id) => ({ id, external_id: id, meta: { boarding_id: `b-${id}`, external_pet_id: '10001' } });
    dequeueOne.mockResolvedValueOnce(form('F1')).mockResolvedValueOnce(form('F2')).mockResolvedValueOnce(null);
    formJobPetMatches.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const db = makeDb();
    await runSync({ supabase: db });
    expect(fetchAndStoreBoardingForm.mock.calls.map((c) => c[1])).toEqual(['b-F2']);
    expect(markDone).toHaveBeenCalledWith(db, 'F1', { meta: { boarding_id: 'b-F1', external_pet_id: '10001', form_skip: 'pet_id_mismatch' } });
  });

  it('a 429 in the form drain fails the run: the next form is not fetched and the item is not marked failed', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    const form = (id) => ({ id, external_id: id, meta: { external_pet_id: '10001' } });
    dequeueOne.mockResolvedValueOnce(form('F1')).mockResolvedValueOnce(form('F2'));
    fetchAndStoreBoardingForm.mockRejectedValueOnce(new SiteThrottled(429));
    const db = makeDb();
    await expect(runSync({ supabase: db })).rejects.toThrow('Booking site answered 429: stopping this run');
    expect(fetchAndStoreBoardingForm).toHaveBeenCalledTimes(1);
    expect(markFailed).not.toHaveBeenCalled();
    expect(db.logUpdates.at(-1).status).toBe('failed');
  });

  it('a stopped reconciliation is reported in the result and the sync log', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    const note = 'Reconciliation stopped: 4 bookings look removed (more than 3), nothing marked';
    reconcileArchivedAppointments.mockResolvedValue({ archived: 0, warnings: 0, errors: 0, skipped: note });
    const db = makeDb();
    const result = await runSync({ supabase: db });
    expect(result.reconcileNote).toBe(note);
    expect(db.logUpdates.at(-1).errors).toContainEqual({ stage: 'reconcile', error: note });
  });

  it('a stopped reconciliation is in the last-sync message on the Settings page', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    const note = 'Reconciliation skipped: 12 bookings missing from the schedule (more than 10), none opened';
    reconcileArchivedAppointments.mockResolvedValue({ archived: 0, warnings: 0, errors: 0, skipped: note });
    const db = makeDb();
    await runSync({ supabase: db });
    expect(db.settingsUpdates.at(-1).last_sync_message).toBe(`Synced 1 appointments. ${note}`);
  });
});

describe('REQ-660: Sync Now and pages that are not the booking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: true }, notices: [] });
    reconcileArchivedAppointments.mockResolvedValue({ archived: 0, warnings: 0, errors: 0, skipped: null });
    dequeueOne.mockResolvedValue(null);
  });

  it('a booking page that redirects is skipped, not failed, and nothing is saved for it', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A'), appt('B')]);
    fetchAppointmentDetails
      .mockRejectedValueOnce(new DetailRedirected('schedule', '/schedule'))
      .mockResolvedValueOnce({ pet_name: 'Dog B', pets: [{ id: '10002', name: 'Dog B' }], check_in_datetime: '2026-10-24T17:00:00Z' });
    const result = await runSync({ supabase: makeDb() });
    expect(result.appointmentsSkipped).toBe(1);
    expect(result.appointmentsFailed).toBe(0);
    expect(result.appointmentsCreated).toBe(1);
    expect(mapAndSaveAppointment).toHaveBeenCalledTimes(1);
  });

  it('any other error on a booking is still a failure, not a skip', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    fetchAppointmentDetails.mockRejectedValue(new Error('Failed to fetch appointment A: 500'));
    const result = await runSync({ supabase: makeDb() });
    expect(result.appointmentsFailed).toBe(1);
    expect(result.appointmentsSkipped).toBe(0);
  });

  it('a page the mapper skipped for having no dates counts as skipped, not created', async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    fetchAppointmentDetails.mockResolvedValue({ pet_name: 'Dog A', pets: [{ id: '10001', name: 'Dog A' }], check_in_datetime: null });
    mapAndSaveAppointment.mockResolvedValue({ skipped: 'dateless_page', stats: {}, notices: [] });
    const result = await runSync({ supabase: makeDb() });
    expect(result.appointmentsSkipped).toBe(1);
    expect(result.appointmentsCreated).toBe(0);
    expect(result.appointmentsFailed).toBe(0);
  });
});

describe('REQ-661: Sync Now and pet identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    reconcileArchivedAppointments.mockResolvedValue({ archived: 0, warnings: 0, errors: 0, skipped: null });
    dequeueOne.mockResolvedValue(null);
  });

  it("passes the schedule's pet IDs as a cross-check only, never as the pet's ID", async () => {
    fetchAllSchedulePages.mockResolvedValue([{ ...appt('A'), petIds: ['10002', '10001'] }]);
    fetchAppointmentDetails.mockResolvedValue({ pet_name: 'Dog A', pets: [{ id: '10001', name: 'Dog A' }], check_in_datetime: '2026-10-24T17:00:00Z' });
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: true }, notices: [] });
    const db = makeDb();
    await runSync({ supabase: db });
    expect(mapAndSaveAppointment.mock.calls[0][1]).toEqual({ supabase: db, schedulePetIds: ['10002', '10001'] });
  });

  it("a page with no pet element is named from its schedule title before the first date (#49)", async () => {
    fetchAllSchedulePages.mockResolvedValue([{ ...appt('A'), title: 'Dog S 10/24-27 (Fri)' }]);
    fetchAppointmentDetails.mockResolvedValue({ pet_name: null, pets: [], check_in_datetime: '2026-10-24T17:00:00Z' });
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: true }, notices: [] });
    await runSync({ supabase: makeDb() });
    expect(mapAndSaveAppointment.mock.calls[0][0].pet_name).toBe('Dog S');
  });

  it("what the mapper couldn't save is logged with the booking's ID (the browser sends no alert)", async () => {
    fetchAllSchedulePages.mockResolvedValue([appt('A')]);
    fetchAppointmentDetails.mockResolvedValue({ pet_name: 'Dog A', pets: [{ id: '10001', name: 'Dog A' }], check_in_datetime: '2026-10-24T17:00:00Z' });
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: true }, notices: ['the notice'] });
    await runSync({ supabase: makeDb() });
    expect(syncLogger.warn).toHaveBeenCalledWith('[Sync] ⚠️ A: the notice');
  });
});
