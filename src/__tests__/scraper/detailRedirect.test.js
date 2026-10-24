/**
 * #344 PR 1 (ADR-008): what the detail step does with a booking page that redirected or had no dates.
 * Nothing is written; the queue item stays open to re-queue on a URL change; Kate hears once per URL
 * about a stay that can't be read, an unknown redirect, or a dateless page; one alert per run.
 * Synthetic IDs and titles only.
 *
 * @requirements REQ-660
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDetailSync, alertDetailNotices, drainDetailQueue, DETAIL_ALERT_JOB } from '../../lib/scraper/syncRunner.js';
import { SiteThrottled } from '../../lib/scraper/auth.js';
import { DetailRedirected } from '../../lib/scraper/redirects.js';

vi.mock('../../lib/scraper/auth.js', async (importOriginal) => ({
  SiteThrottled: (await importOriginal()).SiteThrottled,
  setSession: vi.fn(),
  authenticatedFetch: vi.fn(),
}));
vi.mock('../../lib/scraper/siteAccess.js', async (importOriginal) => ({
  SiteAccessError: (await importOriginal()).SiteAccessError,
  getSiteSession: vi.fn(),
  clearSiteSession: vi.fn(),
}));
vi.mock('../../lib/scraper/syncQueue.js', () => ({
  enqueue: vi.fn(), dequeueOne: vi.fn(), markDone: vi.fn(), markFailed: vi.fn(), resetStuck: vi.fn(), getQueueDepth: vi.fn(),
}));
vi.mock('../../lib/scraper/extraction.js', async (importOriginal) => ({
  fetchAppointmentDetails: vi.fn(),
  nameFromTitle: (await importOriginal()).nameFromTitle,
}));
vi.mock('../../lib/scraper/mapping.js', () => ({ mapAndSaveAppointment: vi.fn() }));
vi.mock('../../lib/scraper/forms.js', () => ({ fetchAndStoreBoardingForm: vi.fn() }));
vi.mock('../../lib/alertKate.js', () => ({ alertAndLog: vi.fn(async () => true) }));

import { getSiteSession } from '../../lib/scraper/siteAccess.js';
import { dequeueOne, markDone, markFailed, getQueueDepth } from '../../lib/scraper/syncQueue.js';
import { fetchAppointmentDetails } from '../../lib/scraper/extraction.js';
import { mapAndSaveAppointment } from '../../lib/scraper/mapping.js';
import { alertAndLog } from '../../lib/alertKate.js';

const URL_A = 'https://agirlandyourdog.com/schedule/a/C63QAAAA/1792836000';
const item = (over = {}) => ({
  id: 'q1', external_id: 'C63QAAAA', type: 'appointment', title: '10/24-27', retry_count: 0,
  source_url: URL_A, meta: { external_pet_id: '10001' }, ...over,
});

// What the booking last held: boardings under its ID, and its sync row. `fail` makes a lookup error.
function makeDb({ boardings = [], syncRow = null, fail = null } = {}) {
  const asked = [];
  return {
    asked,
    from(table) {
      if (table === 'sync_queue') return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      return {
        select: (cols) => ({
          eq: (col, val) => {
            asked.push([table, cols, col, val]);
            if (table === 'boardings') return { limit: () => Promise.resolve(fail === 'boardings' ? { data: null, error: { message: 'down' } } : { data: boardings, error: null }) };
            if (table === 'sync_appointments') return { maybeSingle: () => Promise.resolve(fail === 'sync_appointments' ? { data: null, error: { message: 'down' } } : { data: syncRow, error: null }) };
            throw new Error(`unexpected table ${table}`);
          },
        }),
      };
    },
  };
}

const metaWritten = () => markDone.mock.calls[0][2].meta;
const STAY_NOTICE = 'C63QAAAA "10/24-27": its page now redirects to the schedule (stay moved or cancelled?), so it can\'t be read. Its boarding is unchanged until checked.';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getSiteSession.mockResolvedValue('session=abc');
  getQueueDepth.mockResolvedValue(4);
});

describe('REQ-660: a booking page that redirects to the schedule', () => {
  beforeEach(() => {
    fetchAppointmentDetails.mockRejectedValue(new DetailRedirected('schedule', '/schedule'));
  });

  it('writes nothing and is not a failure', async () => {
    dequeueOne.mockResolvedValue(item());
    const result = await runDetailSync(makeDb());
    expect(result.action).toBe('redirected_to_schedule');
    expect(mapAndSaveAppointment).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('is marked done with detail_redirect for its URL, keeping the rest of its meta', async () => {
    dequeueOne.mockResolvedValue(item());
    await runDetailSync(makeDb());
    expect(markDone).toHaveBeenCalledTimes(1);
    expect(markDone.mock.calls[0][1]).toBe('q1');
    expect(metaWritten()).toStrictEqual({ external_pet_id: '10001', detail_redirect: { kind: 'schedule', url: URL_A } });
  });

  it('never carries detail_skip, so the next scan re-queues it when its URL changes', async () => {
    dequeueOne.mockResolvedValue(item({ meta: { external_pet_id: '10001', detail_skip: 'same_day' } }));
    await runDetailSync(makeDb());
    expect(metaWritten()).not.toHaveProperty('detail_skip');
  });

  it('a booking that held no stay (no boarding, no dates) needs no alert', async () => {
    dequeueOne.mockResolvedValue(item({ title: 'PG FT' }));
    const db = makeDb({ syncRow: { check_in_datetime: null } });
    const result = await runDetailSync(db);
    expect(result.notice).toBe(null);
    expect(db.asked).toStrictEqual([['boardings', 'id', 'external_id', 'C63QAAAA'], ['sync_appointments', 'check_in_datetime, previous_data', 'external_id', 'C63QAAAA']]);
  });

  it('a booking with a boarding under its ID is a stay that can no longer be read: Kate is told', async () => {
    dequeueOne.mockResolvedValue(item());
    const result = await runDetailSync(makeDb({ boardings: [{ id: 'b1' }] }));
    expect(result.notice).toBe('C63QAAAA "10/24-27": its page now redirects to the schedule (stay moved or cancelled?), so it can\'t be read. Its boarding is unchanged until checked.');
  });

  it('a booking whose sync row has dates is a stay too, even with no boarding', async () => {
    dequeueOne.mockResolvedValue(item());
    const result = await runDetailSync(makeDb({ syncRow: { check_in_datetime: '2026-10-24T10:00:00.000Z' } }));
    expect(result.notice).toBe(STAY_NOTICE);
  });

  it('a booking whose sync row lost its dates but kept them in its previous version is a stay too', async () => {
    dequeueOne.mockResolvedValue(item());
    const result = await runDetailSync(makeDb({ syncRow: { check_in_datetime: null, previous_data: { check_in_datetime: '2026-10-29T16:00:00+00:00' } } }));
    expect(result.notice).toBe(STAY_NOTICE);
  });

  it('a previous version without dates is not a stay', async () => {
    dequeueOne.mockResolvedValue(item({ title: 'PG FT' }));
    const result = await runDetailSync(makeDb({ syncRow: { check_in_datetime: null, previous_data: { service_type: 'Oct 18-24, 2026' } } }));
    expect(result.notice).toBe(null);
  });

  it('when the boardings lookup fails, it assumes a stay and tells Kate', async () => {
    dequeueOne.mockResolvedValue(item());
    const result = await runDetailSync(makeDb({ fail: 'boardings' }));
    expect(result.notice).toBe(STAY_NOTICE);
  });

  it('when the sync-row lookup fails, it assumes a stay and tells Kate', async () => {
    dequeueOne.mockResolvedValue(item());
    const result = await runDetailSync(makeDb({ fail: 'sync_appointments' }));
    expect(result.notice).toBe(STAY_NOTICE);
  });

  it('the same URL already reported is not reported again, and its stay is not looked up', async () => {
    dequeueOne.mockResolvedValue(item({ meta: { detail_redirect: { kind: 'schedule', url: URL_A } } }));
    const db = makeDb({ boardings: [{ id: 'b1' }] });
    const result = await runDetailSync(db);
    expect(result.notice).toBe(null);
    expect(db.asked).toStrictEqual([]);
  });

  it('a new URL for a booking reported before is reported again', async () => {
    dequeueOne.mockResolvedValue(item({ meta: { detail_redirect: { kind: 'schedule', url: 'https://agirlandyourdog.com/schedule/a/C63QAAAA/1792800000' } } }));
    const result = await runDetailSync(makeDb({ boardings: [{ id: 'b1' }] }));
    expect(result.notice).toMatch(/now redirects to the schedule/);
  });

  it('an item with no meta at all is handled the same way', async () => {
    dequeueOne.mockResolvedValue(item({ meta: null }));
    const result = await runDetailSync(makeDb({ boardings: [{ id: 'b1' }] }));
    expect(result.notice).toMatch(/now redirects to the schedule/);
    expect(metaWritten()).toStrictEqual({ detail_redirect: { kind: 'schedule', url: URL_A } });
  });

  it('returns the item and the queue depth', async () => {
    dequeueOne.mockResolvedValue(item());
    const result = await runDetailSync(makeDb());
    expect(result).toStrictEqual({ action: 'redirected_to_schedule', externalId: 'C63QAAAA', queueDepth: 4, notice: null });
  });
});

describe('REQ-660: a booking page that redirects anywhere else', () => {
  beforeEach(() => {
    fetchAppointmentDetails.mockRejectedValue(new DetailRedirected('elsewhere', '/clients/10003'));
  });

  it('writes nothing, is not retried as a failure, and Kate is told where it went', async () => {
    dequeueOne.mockResolvedValue(item());
    const result = await runDetailSync(makeDb());
    expect(result.action).toBe('redirected_elsewhere');
    expect(mapAndSaveAppointment).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
    expect(result.notice).toBe('C63QAAAA "10/24-27": its page redirected to /clients/10003, so it wasn\'t read.');
    expect(metaWritten().detail_redirect).toStrictEqual({ kind: 'elsewhere', url: URL_A });
  });

  it('a redirect with no Location says nowhere', async () => {
    fetchAppointmentDetails.mockRejectedValue(new DetailRedirected('elsewhere', null));
    dequeueOne.mockResolvedValue(item({ title: null }));
    const result = await runDetailSync(makeDb());
    expect(result.notice).toBe('C63QAAAA "": its page redirected to nowhere, so it wasn\'t read.');
  });
});

describe('REQ-660: a booking page with no dates', () => {
  beforeEach(() => {
    fetchAppointmentDetails.mockResolvedValue({ external_id: 'C63QAAAA', pet_name: 'Dog A', pets: [{ id: '10001', name: 'Dog A' }] });
    mapAndSaveAppointment.mockResolvedValue({ skipped: 'dateless_page', stats: {}, notices: [] });
  });

  it('is counted as dateless_page, marked done for its URL without detail_skip, and Kate is told', async () => {
    dequeueOne.mockResolvedValue(item({ meta: { external_pet_id: '10001', detail_skip: 'same_day' } }));
    const result = await runDetailSync(makeDb());
    expect(result).toStrictEqual({
      action: 'dateless_page', externalId: 'C63QAAAA', queueDepth: 4,
      notice: 'C63QAAAA "10/24-27": its page had no check-in/check-out dates, so nothing was saved. The booking site\'s page layout may have changed.',
    });
    expect(metaWritten()).toStrictEqual({ external_pet_id: '10001', detail_dateless: URL_A });
    expect(markDone).toHaveBeenCalledTimes(1);
  });

  it('an item with no meta at all is handled the same way', async () => {
    dequeueOne.mockResolvedValue(item({ meta: null }));
    const result = await runDetailSync(makeDb());
    expect(result.notice).toMatch(/had no check-in\/check-out dates/);
    expect(metaWritten()).toStrictEqual({ detail_dateless: URL_A });
  });

  it('the same URL is not reported twice', async () => {
    dequeueOne.mockResolvedValue(item({ meta: { detail_dateless: URL_A } }));
    const result = await runDetailSync(makeDb());
    expect(result.notice).toBe(null);
  });
});

describe('REQ-660: one alert per run', () => {
  it('no notices: nothing is sent', async () => {
    expect(await alertDetailNotices(makeDb(), [null, undefined, null])).toBe(null);
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('two notices in a run: one message that counts and lists both', async () => {
    const db = makeDb();
    expect(await alertDetailNotices(db, ['first one', null, 'second one'])).toBe(true);
    expect(alertAndLog).toHaveBeenCalledTimes(1);
    expect(alertAndLog).toHaveBeenCalledWith(db, 'sync-detail', '⚠️ Q Boarding sync: 2 booking page(s) not read\n• first one\n• second one');
  });

  it('the job name is the one ops-watch reports failed alerts for', () => {
    expect(DETAIL_ALERT_JOB).toBe('sync-detail');
  });
});

describe('REQ-660: a page read after an earlier redirect', () => {
  beforeEach(() => {
    fetchAppointmentDetails.mockResolvedValue({ external_id: 'C63QAAAA', pet_name: 'Dog A', pets: [{ id: '10001', name: 'Dog A' }], check_in_datetime: '2026-10-24T10:00:00.000Z' });
    mapAndSaveAppointment.mockResolvedValue({ stats: { syncCreated: false, syncUpdated: true, dogUpdated: false, boardingUpdated: false }, notices: [] });
  });

  it('drops the redirect and dateless marks, so the same URL failing later is reported again', async () => {
    dequeueOne.mockResolvedValue(item({ meta: { external_pet_id: '10001', detail_redirect: { kind: 'schedule', url: URL_A }, detail_dateless: URL_A } }));
    const db = makeDb();
    const result = await runDetailSync(db);
    expect(result.action).toBe('updated');
    expect(markDone).toHaveBeenCalledWith(db, 'q1', { meta: { external_pet_id: '10001' } });
  });

  it('an item with neither mark keeps its meta untouched', async () => {
    dequeueOne.mockResolvedValue(item());
    const db = makeDb();
    await runDetailSync(db);
    expect(markDone).toHaveBeenCalledWith(db, 'q1');
  });
});

describe('REQ-660: draining the queue sends the run\'s one alert', () => {
  const redirected = () => fetchAppointmentDetails.mockRejectedValueOnce(new DetailRedirected('elsewhere', '/clients/10003'));

  it('stops at idle and sends one alert with every notice collected', async () => {
    dequeueOne.mockResolvedValueOnce(item()).mockResolvedValueOnce(item({ id: 'q2', external_id: 'C63QAAAB', title: '10/25-26' })).mockResolvedValueOnce(null);
    redirected();
    redirected();
    const db = makeDb();
    const results = await drainDetailQueue(db, { maxItems: 20 });
    expect(results.map((r) => r.action)).toStrictEqual(['redirected_elsewhere', 'redirected_elsewhere', 'idle']);
    expect(alertAndLog).toHaveBeenCalledTimes(1);
    expect(alertAndLog.mock.calls[0][2]).toBe('⚠️ Q Boarding sync: 2 booking page(s) not read\n• C63QAAAA "10/24-27": its page redirected to /clients/10003, so it wasn\'t read.\n• C63QAAAB "10/25-26": its page redirected to /clients/10003, so it wasn\'t read.');
  });

  it('still sends the alert when a later item throws, then rethrows', async () => {
    dequeueOne.mockResolvedValueOnce(item()).mockResolvedValueOnce(item({ id: 'q2', external_id: 'C63QAAAB' }));
    redirected();
    fetchAppointmentDetails.mockRejectedValueOnce(new SiteThrottled(429));
    await expect(drainDetailQueue(makeDb(), { maxItems: 20 })).rejects.toBeInstanceOf(SiteThrottled);
    expect(alertAndLog).toHaveBeenCalledTimes(1);
    expect(alertAndLog.mock.calls[0][2]).toBe('⚠️ Q Boarding sync: 1 booking page(s) not read\n• C63QAAAA "10/24-27": its page redirected to /clients/10003, so it wasn\'t read.');
  });

  it('stops after maxItems', async () => {
    dequeueOne.mockResolvedValue(item());
    fetchAppointmentDetails.mockRejectedValue(new DetailRedirected('schedule', '/schedule'));
    const results = await drainDetailQueue(makeDb(), { maxItems: 3 });
    expect(results).toHaveLength(3);
  });

  it('stops at the first stop action: an empty queue, or a failed session', async () => {
    for (const [setup, action] of [
      [() => dequeueOne.mockResolvedValueOnce(null), 'idle'],
      [() => getSiteSession.mockRejectedValueOnce(new Error('no session')), 'session_failed'],
    ]) {
      vi.clearAllMocks();
      getQueueDepth.mockResolvedValue(4);
      getSiteSession.mockResolvedValue('session=abc');
      setup();
      const results = await drainDetailQueue(makeDb(), { maxItems: 5 });
      expect(results.map((r) => r.action)).toStrictEqual([action]);
    }
  });
});
