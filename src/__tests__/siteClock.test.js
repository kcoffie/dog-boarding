import { describe, it, expect, vi, afterEach } from 'vitest';
import { siteDate, siteTime, formatSiteDate, timeStatus, bookingTime, siteNow, siteMidnight } from '../utils/siteClock.js';
import { getWeekendWindowISO, formatWeekendDatetime, formatWeekendHeaderDates, getWeekendBoardings, formatCompactDateRange } from '../../api/roster-image.js';
import { formatReadableDateRange } from '../../api/intraday-image.js';
import { queryBoarders } from '../lib/pictureOfDay.js';
import { findFormForBoarding } from '../lib/scraper/forms.js';
import { parseServiceTypeDates } from '../lib/scraper/extraction.js';
import { mapAndSaveAppointment } from '../lib/scraper/mapping.js';
import { parseAppointmentPage } from '../lib/scraper/extraction.js';
import { createFakeSupabase } from './scraper/fakeSupabase.js';
import { onePetPage } from './scraper/twoPetPages.js';

// Booking times are San Francisco clock times written as UTC (#353, ADR-009):
// the site shows 10:00am and stores 10:00Z, summer and winter alike.
// Every expected value below is worked out by hand from that rule.
//
// The host zones that can catch a wrong date: every stored time is 07:00–17:15Z, so
// UTC, Pacific, Paris and Tokyo give 10:00Z the same date even with getDate().
// In Kiritimati (+14) 10:00Z is the next day; in Pago Pago (−11) the day before.
const ZONES = ['UTC', 'America/Los_Angeles', 'Europe/Paris', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
const JANUARY_OFFSET = {
  UTC: 0, 'America/Los_Angeles': 480, 'Europe/Paris': -60, 'Asia/Tokyo': -540,
  'Pacific/Kiritimati': -840, 'Pacific/Pago_Pago': 660,
};

const originalTZ = process.env.TZ;
// Node re-reads TZ on assignment, but only on the main thread (vitest forks). In a worker
// thread (Stryker) it does nothing: only the host's own zone runs, the rest show as skipped.
const onHost = (zone) => {
  process.env.TZ = zone;
  expect(new Date(2026, 0, 15).getTimezoneOffset(), `host timezone switch to ${zone}`).toBe(JANUARY_OFFSET[zone]);
};
const HOST_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CAN_SWITCH = (() => {
  const before = process.env.TZ;
  process.env.TZ = 'Pacific/Kiritimati';
  const switched = new Date(2026, 0, 15).getTimezoneOffset() === JANUARY_OFFSET['Pacific/Kiritimati'];
  if (before === undefined) delete process.env.TZ;
  else process.env.TZ = before;
  return switched;
})();
const hostIt = (zone) => (CAN_SWITCH || zone === HOST_ZONE ? it : it.skip);
const eachZone = (name, fn) => {
  for (const zone of ZONES) hostIt(zone)(`${name} (host in ${zone})`, async () => { onHost(zone); await fn(); });
};
const atClock = (instant) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

/**
 * @requirements REQ-065
 */
describe('REQ-065: a booking time reads as the San Francisco time the site shows', () => {
  eachZone('a 10:00am drop-off stored 10:00Z is 10:00 AM on 10-29', () => {
    expect(siteDate('2026-10-29T10:00:00Z')).toBe('2026-10-29');
    expect(siteTime('2026-10-29T10:00:00Z')).toBe('10:00 AM');
  });

  eachZone('a 4:15pm pick-up stored 16:15Z is 4:15 PM PT, in winter too', () => {
    expect(bookingTime('2026-11-12T16:15:00Z', 'PM')).toBe('4:15 PM PT');
    expect(bookingTime('2026-01-15T16:15:00Z', null)).toBe('4:15 PM PT');
  });

  eachZone('a stay across the end of DST keeps its clock times: 10:00 AM 10-29 to 5:00 PM 11-02', () => {
    expect(bookingTime('2026-10-29T10:00:00Z', 'AM')).toBe('10:00 AM PT');
    expect(bookingTime('2026-11-02T17:00:00Z', 'PM')).toBe('5:00 PM PT');
    expect(siteDate('2026-11-02T17:00:00Z')).toBe('2026-11-02');
  });

  eachZone("the date's weekday is the site's: 10-31 is a Saturday", () => {
    expect(formatSiteDate('2026-10-31T10:15:00Z', { weekday: 'short' })).toBe('Sat');
  });

  it('no value or a broken one reads as nothing', () => {
    expect(siteDate(null)).toBeNull();
    expect(siteTime('not-a-date')).toBeNull();
    expect(formatSiteDate(undefined, { weekday: 'short' })).toBeNull();
    expect(bookingTime(null, 'AM')).toBeNull();
  });
});

/**
 * @requirements REQ-065
 */
describe('REQ-065: only a date is shown when the time is not known', () => {
  it('a title-only date with no AM/PM label shows no time, at each sync midnight (00:00, 07:00, 08:00, 23:00Z)', () => {
    for (const iso of ['2026-03-07T00:00:00Z', '2026-03-04T07:00:00Z', '2026-01-20T08:00:00Z', '2026-03-08T23:00:00Z']) {
      expect(timeStatus(iso, null), iso).toBe('title-only');
      expect(bookingTime(iso, null), iso).toBeNull();
    }
  });

  it('a real time with no label still shows: 5:15 PM, 8:30 AM, 7:00:30', () => {
    expect(bookingTime('2026-03-07T17:15:00Z', null)).toBe('5:15 PM PT');
    expect(bookingTime('2026-03-07T08:30:00Z', null)).toBe('8:30 AM PT');
    expect(timeStatus('2026-03-07T07:00:30Z', null)).toBe('shown');
  });

  it('a "PM" label on a morning time contradicts it: date only (10:00Z PM, 07:00Z PM)', () => {
    expect(timeStatus('2026-06-28T10:00:00Z', 'PM')).toBe('contradicts');
    expect(bookingTime('2026-06-28T10:00:00Z', 'PM')).toBeNull();
    expect(timeStatus('2026-03-19T07:00:00Z', 'PM')).toBe('contradicts');
  });

  it('an "AM" label on an afternoon time contradicts it', () => {
    expect(timeStatus('2026-06-28T16:00:00Z', 'AM')).toBe('contradicts');
  });

  it('a label that agrees with the time shows it, whatever its case; noon is PM', () => {
    expect(timeStatus('2026-06-28T10:00:00Z', 'am')).toBe('shown');
    expect(timeStatus('2026-06-28T12:00:00Z', 'PM')).toBe('shown');
    expect(timeStatus('2026-06-28T11:59:00Z', 'AM')).toBe('shown');
  });
});

/**
 * @requirements REQ-065
 */
describe("REQ-065: San Francisco's now, written as a site clock value", () => {
  eachZone('at 9:15am PDT (16:15Z) it is 09:15 on 10-26', () => {
    expect(siteNow(new Date('2026-10-26T16:15:00Z'))).toBe('2026-10-26T09:15:00.000Z');
  });

  eachZone('at 9:15am PST (17:15Z, after DST ends) it is 09:15 on 11-02', () => {
    expect(siteNow(new Date('2026-11-02T17:15:00Z'))).toBe('2026-11-02T09:15:00.000Z');
  });

  it('just after midnight it is hour 00, not 24', () => {
    expect(siteNow(new Date('2026-10-27T07:30:45Z'))).toBe('2026-10-27T00:30:45.000Z');
  });

  it('defaults to the current time', () => {
    atClock('2026-10-26T16:15:00Z');
    expect(siteNow()).toBe('2026-10-26T09:15:00.000Z');
  });

  eachZone('a 4:15pm pick-up today is still ahead at 9:15am Pacific', () => {
    expect(siteNow(new Date('2026-10-26T16:15:00Z')) < '2026-10-26T16:15:00.000Z').toBe(true);
  });

  eachZone('a picked calendar day (local midnight 11-03) is the site midnight 11-03', () => {
    expect(siteMidnight(new Date(2026, 10, 3))).toBe('2026-11-03T00:00:00.000Z');
  });
});

/**
 * @requirements REQ-065
 */
describe('REQ-065: the Friday pm roster shows the site times', () => {
  eachZone('a 10:15am Saturday pick-up prints "Sat 10:15 AM PT", not 3:15 AM', () => {
    expect(formatWeekendDatetime('2026-10-31T10:15:00Z', null)).toBe('Sat 10:15 AM PT');
  });

  it('a Friday 4pm arrival prints "Fri 4:00 PM PT"', () => {
    expect(formatWeekendDatetime('2026-10-30T16:00:00Z', 'PM')).toBe('Fri 4:00 PM PT');
  });

  it("a Monday 5pm pick-up after DST ends prints \"Mon 5:00 PM PT\"", () => {
    expect(formatWeekendDatetime('2026-11-02T17:00:00Z', 'PM')).toBe('Mon 5:00 PM PT');
  });

  it('a title-only date prints the day only', () => {
    expect(formatWeekendDatetime('2026-03-07T00:00:00Z', null)).toBe('Sat');
  });

  it('a contradicting AM/PM label prints the day only, and says so in the log', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(formatWeekendDatetime('2026-06-28T10:00:00Z', 'PM')).toBe('Sun');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('"PM" contradicts 2026-06-28T10:00:00Z');
  });

  it('a time that agrees with its label logs nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    formatWeekendDatetime('2026-10-30T16:00:00Z', 'PM');
    expect(warn).not.toHaveBeenCalled();
  });

  it('no time prints a dash', () => {
    expect(formatWeekendDatetime(null)).toBe('—');
    expect(formatWeekendDatetime('not-a-date')).toBe('—');
  });

  eachZone('the date ranges are the site dates: a title-only 3/7–3/9 stay is "3/7–3/9" and "Mar 7 – Mar 9"', () => {
    expect(formatCompactDateRange('2026-03-07T00:00:00Z', '2026-03-09T00:00:00Z')).toBe('3/7–3/9');
    expect(formatReadableDateRange('2026-03-07T00:00:00Z', '2026-03-09T00:00:00Z')).toBe('Mar 7 – Mar 9');
  });

  it('a missing date in a range prints "?"', () => {
    expect(formatCompactDateRange(null, '2026-03-09T00:00:00Z')).toBe('?–3/9');
    expect(formatReadableDateRange('2026-03-07T00:00:00Z', 'bad')).toBe('Mar 7 – ?');
  });
});

/**
 * @requirements REQ-065
 */
describe("REQ-065: the Friday pm roster's weekend window", () => {
  eachZone('a run at Fri 3:00:05pm PDT starts at 3:00pm San Francisco and ends Monday noon', () => {
    const { start, end } = getWeekendWindowISO(new Date('2026-10-30T22:00:05Z'));
    expect(start).toBe('2026-10-30T15:00:00.000Z');
    expect(end).toBe('2026-11-02T12:00:00.000Z');
  });

  it('the PST retry at Sat 00:00:10Z is still Friday 4pm in San Francisco: ends Monday 11-09', () => {
    const { start, end } = getWeekendWindowISO(new Date('2026-11-07T00:00:10Z'));
    expect(start).toBe('2026-11-06T16:00:00.000Z');
    expect(end).toBe('2026-11-09T12:00:00.000Z');
  });

  it('Saturday 10am: ends Monday noon', () => {
    expect(getWeekendWindowISO(new Date('2026-04-04T17:00:00Z')).end).toBe('2026-04-06T12:00:00.000Z');
  });

  it("Sunday 8pm PST is already Monday in UTC, but the window still ends this Monday noon", () => {
    const { start, end } = getWeekendWindowISO(new Date('2026-11-02T04:00:00Z'));
    expect(start).toBe('2026-11-01T20:00:00.000Z');
    expect(end).toBe('2026-11-02T12:00:00.000Z');
  });

  it('a manual run on a Wednesday falls back to +3 days', () => {
    expect(getWeekendWindowISO(new Date('2026-04-01T15:00:00Z')).end).toBe('2026-04-04T12:00:00.000Z');
  });

  it('the header runs from Friday to Monday (Kate, Q4)', () => {
    const now = new Date('2026-10-30T22:00:05Z');
    const { displayFri, displayMon } = getWeekendWindowISO(now);
    expect(displayFri).toBe(now);
    expect(formatWeekendHeaderDates(displayFri, displayMon)).toBe('Fri Oct 30 – Mon Nov 2');
  });

  it('the 3pm run lists Friday-afternoon arrivals and departures and Monday-morning pick-ups, not earlier or later ones', async () => {
    const rows = [
      { external_id: 'EARLY', arrival_datetime: '2026-10-30T14:45:00Z', departure_datetime: '2026-11-05T10:00:00Z' },
      { external_id: 'AT3PM', arrival_datetime: '2026-10-30T15:00:00Z', departure_datetime: '2026-11-05T10:00:00Z' },
      { external_id: 'AT4PM', arrival_datetime: '2026-10-30T16:00:00Z', departure_datetime: '2026-11-05T10:00:00Z' },
      { external_id: 'OUT415', arrival_datetime: '2026-10-25T10:00:00Z', departure_datetime: '2026-10-30T16:15:00Z' },
      { external_id: 'MONAM', arrival_datetime: '2026-10-25T10:00:00Z', departure_datetime: '2026-11-02T10:15:00Z' },
      { external_id: 'MONPM', arrival_datetime: '2026-10-25T10:00:00Z', departure_datetime: '2026-11-02T16:15:00Z' },
    ].map((r) => ({ ...r, booking_status: 'confirmed', cancelled_at: null, dogs: { name: r.external_id } }));
    const chain = { select: () => chain, or: () => chain, order: async () => ({ data: rows, error: null }) };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { start, end } = getWeekendWindowISO(new Date('2026-10-30T22:00:05Z'));
    const { arriving, departing } = await getWeekendBoardings({ from: () => chain }, start, end);
    expect(arriving.map((b) => b.external_id)).toEqual(['AT3PM', 'AT4PM']);
    expect(departing.map((b) => b.external_id)).toEqual(['OUT415', 'MONAM']);
  });

  it("the roster rows carry the site's AM/PM labels", async () => {
    const rows = [{ external_id: 'A', arrival_datetime: '2026-10-30T16:00:00Z', departure_datetime: '2026-11-02T10:15:00Z',
      arrival_ampm: 'PM', departure_ampm: 'AM', booking_status: 'confirmed', cancelled_at: null, dogs: { name: 'A' } }];
    let selected = '';
    const chain = { select: (s) => { selected = s; return chain; }, or: () => chain, order: async () => ({ data: rows, error: null }) };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { arriving } = await getWeekendBoardings({ from: () => chain }, '2026-10-30T15:00:00.000Z', '2026-11-02T12:00:00.000Z');
    expect(selected).toContain('arrival_ampm, departure_ampm');
    expect([arriving[0].arrival_ampm, arriving[0].departure_ampm]).toEqual(['PM', 'AM']);
  });
});

/**
 * @requirements REQ-065
 */
describe('REQ-065: server dates are right in any runtime zone, not only on UTC', () => {
  eachZone("the boarders for 10-29 are those staying past the site's midnight of 10-30", async () => {
    const bounds = {};
    const chain = {
      select: () => chain,
      lt: (col, v) => { bounds.lt = v; return chain; },
      gte: async (col, v) => { bounds.gte = v; return { data: [], error: null }; },
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await queryBoarders({ from: () => chain }, '2026-10-29');
    expect(bounds).toEqual({ lt: '2026-10-30T00:00:00.000Z', gte: '2026-10-30T00:00:00.000Z' });
  });

  eachZone("the boarders for 10-31 cross into November: the site's midnight of 11-01", async () => {
    let lt;
    const chain = { select: () => chain, lt: (c, v) => { lt = v; return chain; }, gte: async () => ({ data: [], error: null }) };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await queryBoarders({ from: () => chain }, '2026-10-31');
    expect(lt).toBe('2026-11-01T00:00:00.000Z');
  });

  // Submissions are newest first; the window is the 7 days up to and including the arrival's date
  const subs = [
    { submissionId: 4, submittedDate: '10/30/2026' },
    { submissionId: 3, submittedDate: '10/29/2026' },
    { submissionId: 2, submittedDate: '10/22/2026' },
    { submissionId: 1, submittedDate: '10/21/2026' },
  ];
  eachZone('a form sent on the arrival day (10-29) matches a 10:00am arrival', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(findFormForBoarding(subs, { arrival_datetime: '2026-10-29T10:00:00Z' })).toBe(3);
  });

  eachZone('a form sent 7 days before (10-22) matches; 8 days before (10-21) does not', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(findFormForBoarding(subs.slice(2), { arrival_datetime: '2026-10-29T10:00:00Z' })).toBe(2);
    expect(findFormForBoarding(subs.slice(3), { arrival_datetime: '2026-10-29T10:00:00Z' })).toBeNull();
  });

  it('a form sent the day after arrival does not match', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(findFormForBoarding(subs.slice(0, 1), { arrival_datetime: '2026-10-29T10:00:00Z' })).toBeNull();
  });

  it('a boarding with no arrival time matches no form', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(findFormForBoarding(subs, { arrival_datetime: null })).toBeNull();
  });

  eachZone('a title-only date "2/13-18" is stored as the site midnights of 2-13 and 2-18', () => {
    const { checkIn, checkOut } = parseServiceTypeDates('2/13-18', 2026);
    expect([checkIn.toISOString(), checkOut.toISOString()]).toEqual(['2026-02-13T00:00:00.000Z', '2026-02-18T00:00:00.000Z']);
  });

  eachZone('a title-only date across months "2/28-3/5" is 2-28 to 3-05', () => {
    const { checkIn, checkOut } = parseServiceTypeDates('2/28-3/5', 2026);
    expect([checkIn.toISOString(), checkOut.toISOString()]).toEqual(['2026-02-28T00:00:00.000Z', '2026-03-05T00:00:00.000Z']);
  });
});

/**
 * @requirements REQ-065
 */
describe("REQ-065: a boarding's form job is queued until the end of its departure day in San Francisco", () => {
  // onePetPage: one pet (40001), arrives 11-03 4:00pm, departs 11-12 5:00pm (site clock)
  const save = (db) => mapAndSaveAppointment(
    { ...parseAppointmentPage(onePetPage(), '/schedule/a/BK000002/1793721600'), external_id: 'BK000002' },
    { supabase: db },
  );
  const formJobs = (db) => db._mockData.sync_queue.filter((q) => q.type === 'form').length;

  eachZone('at 9pm PST on the departure day (11-13 05:00Z) the form job is queued', async () => {
    atClock('2026-11-13T05:00:00Z');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = createFakeSupabase();
    await save(db);
    expect(formJobs(db)).toBe(1);
  });

  eachZone('at 1am PST the day after departure (11-13 09:00Z) it is not', async () => {
    atClock('2026-11-13T09:00:00Z');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = createFakeSupabase();
    await save(db);
    expect(formJobs(db)).toBe(0);
  });
});
