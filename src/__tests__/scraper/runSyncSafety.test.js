/**
 * Sync Now (runSync) stops safely: an empty schedule and a 429/403 end the run before
 * reconciliation, and a stopped reconciliation is reported (#324).
 * @requirements REQ-657
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/scraper/auth.js', async (importOriginal) => ({
  SiteThrottled: (await importOriginal()).SiteThrottled,
  authenticate: vi.fn(),
  isAuthenticated: vi.fn(() => true),
  resetSiteStop: vi.fn(),
}));
vi.mock('../../lib/scraper/schedule.js', () => ({ fetchAllSchedulePages: vi.fn() }));
vi.mock('../../lib/scraper/extraction.js', () => ({ fetchAppointmentDetails: vi.fn() }));
vi.mock('../../lib/scraper/appointmentFilter.js', () => ({ applyDetailFilters: vi.fn(() => ({ skip: false })) }));
vi.mock('../../lib/scraper/mapping.js', () => ({ mapAndSaveAppointment: vi.fn() }));
vi.mock('../../lib/scraper/reconcile.js', () => ({ reconcileArchivedAppointments: vi.fn() }));
vi.mock('../../lib/scraper/forms.js', () => ({ fetchAndStoreBoardingForm: vi.fn() }));
vi.mock('../../lib/scraper/syncQueue.js', () => ({ dequeueOne: vi.fn(), markDone: vi.fn(), markFailed: vi.fn() }));
vi.mock('../../lib/scraper/syncSettingsRow.js', () => ({ readSettingsRow: vi.fn(async () => ({ id: 1 })) }));
vi.mock('../../lib/scraper/logger.js', () => ({
  syncLogger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logSyncStart: vi.fn(),
  logSyncEnd: vi.fn(),
}));

import { runSync } from '../../lib/scraper/sync.js';
import { SiteThrottled, resetSiteStop } from '../../lib/scraper/auth.js';
import { fetchAllSchedulePages } from '../../lib/scraper/schedule.js';
import { fetchAppointmentDetails } from '../../lib/scraper/extraction.js';
import { mapAndSaveAppointment } from '../../lib/scraper/mapping.js';
import { reconcileArchivedAppointments } from '../../lib/scraper/reconcile.js';
import { dequeueOne, markFailed } from '../../lib/scraper/syncQueue.js';
import { fetchAndStoreBoardingForm } from '../../lib/scraper/forms.js';

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
    fetchAppointmentDetails.mockResolvedValue({ pet_name: 'Dog A', check_in_datetime: '2026-10-24T17:00:00Z' });
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: true } });
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
      .mockResolvedValueOnce({ pet_name: 'Dog A', check_in_datetime: '2026-10-24T17:00:00Z' })
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
