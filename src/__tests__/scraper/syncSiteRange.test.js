/**
 * Sync Now compares its date range with stored booking times as site clock values (#353, ADR-009):
 * a picked day is that day's site midnight, and "now" is San Francisco's now, on any device.
 * The schedule pages are still fetched by the picked local days.
 * @requirements REQ-065
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { fetchAllSchedulePages } from '../../lib/scraper/schedule.js';
import { fetchAppointmentDetails } from '../../lib/scraper/extraction.js';
import { applyDetailFilters } from '../../lib/scraper/appointmentFilter.js';
import { mapAndSaveAppointment } from '../../lib/scraper/mapping.js';
import { reconcileArchivedAppointments } from '../../lib/scraper/reconcile.js';
import { dequeueOne } from '../../lib/scraper/syncQueue.js';

function makeDb() {
  const chain = () => {
    const c = {
      select: () => c, insert: () => c, eq: () => c, lt: () => c, in: () => c, order: () => c, limit: () => c,
      update: () => c,
      single: async () => ({ data: { id: 'log-1' }, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return c;
  };
  return { from: chain };
}

const ZONES = ['America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
const JANUARY_OFFSET = { 'America/Los_Angeles': 480, 'Pacific/Kiritimati': -840, 'Pacific/Pago_Pago': 660 };
const originalTZ = process.env.TZ;
const HOST_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CAN_SWITCH = (() => {
  const before = process.env.TZ;
  // Two different zones, so a host already in one of them can't pass the probe
  process.env.TZ = 'Pacific/Kiritimati';
  const east = new Date(2026, 0, 15).getTimezoneOffset() === -840;
  process.env.TZ = 'Pacific/Pago_Pago';
  const switched = east && new Date(2026, 0, 15).getTimezoneOffset() === 660;
  if (before === undefined) delete process.env.TZ;
  else process.env.TZ = before;
  return switched;
})();
const eachZone = (name, fn) => {
  for (const zone of ZONES) {
    (CAN_SWITCH || zone === HOST_ZONE ? it : it.skip)(`${name} (host in ${zone})`, async () => {
      process.env.TZ = zone;
      expect(new Date(2026, 0, 15).getTimezoneOffset(), `host timezone switch to ${zone}`).toBe(JANUARY_OFFSET[zone]);
      await fn();
    });
  }
};

const iso = (d) => (d ? d.toISOString() : d);

describe('REQ-065: Sync Now compares its range with stored times as site clock values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchAllSchedulePages.mockResolvedValue([{ id: 'A', title: '11/3-12', url: 'https://agirlandyourdog.com/schedule/a/A/1', petIds: [] }]);
    fetchAppointmentDetails.mockResolvedValue({ pet_name: 'Dog A', pets: [{ id: '10001', name: 'Dog A' }], check_in_datetime: '2026-11-03T16:00:00Z' });
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: true }, notices: [] });
    reconcileArchivedAppointments.mockResolvedValue({ archived: 0, warnings: 0, errors: 0, skipped: null });
    dequeueOne.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  eachZone('picked days 11-03 to 11-13 filter and reconcile from the site midnight of 11-03 to that of 11-13', async () => {
    await runSync({ supabase: makeDb(), startDate: new Date(2026, 10, 3), endDate: new Date(2026, 10, 13) });
    const { startDate, endDate } = applyDetailFilters.mock.calls[0][2];
    expect([iso(startDate), iso(endDate)]).toEqual(['2026-11-03T00:00:00.000Z', '2026-11-13T00:00:00.000Z']);
    const [, , reconcileStart, reconcileEnd] = reconcileArchivedAppointments.mock.calls[0];
    expect([iso(reconcileStart), iso(reconcileEnd)]).toEqual(['2026-11-03T00:00:00.000Z', '2026-11-13T00:00:00.000Z']);
  });

  eachZone('the schedule pages are still fetched by the picked local days', async () => {
    const start = new Date(2026, 10, 3);
    await runSync({ supabase: makeDb(), startDate: start, endDate: new Date(2026, 10, 13) });
    const { startDate } = fetchAllSchedulePages.mock.calls[0][0];
    expect([startDate.getFullYear(), startDate.getMonth(), startDate.getDate()]).toEqual([2026, 10, 3]);
  });

  eachZone("a full sync at 9:15am Pacific reconciles from San Francisco's now, so a 4:15pm pick-up today is checked", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T16:15:00Z'));
    await runSync({ supabase: makeDb() });
    const [, , reconcileStart, reconcileEnd] = reconcileArchivedAppointments.mock.calls[0];
    expect(iso(reconcileStart)).toBe('2026-10-26T09:15:00.000Z');
    expect(reconcileEnd).toBeUndefined();
    const { startDate, endDate } = applyDetailFilters.mock.calls[0][2];
    expect([startDate, endDate]).toEqual([undefined, undefined]);
  });
});
