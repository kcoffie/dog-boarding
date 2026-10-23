// @vitest-environment node
/**
 * #344 PR 1 (ADR-008): booking and form pages are read without following redirects, and a page
 * with no dates writes nothing.
 *
 * The fetch tests run Node's real fetch against a local server (a mocked Response can't show what
 * undici does with `redirect: 'manual'`). Only the host is swapped: every request the code makes
 * to the booking site lands on the local server instead, so nothing here reaches the real site.
 * Synthetic names and IDs only.
 *
 * @requirements REQ-660
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { SCRAPER_CONFIG } from '../../lib/scraper/config.js';
import { classifyRedirect, DetailRedirected, SESSION_EXPIRED_MESSAGE } from '../../lib/scraper/redirects.js';
import { classifyCandidateResponse } from '../../lib/scraper/reconcile.js';
import { setSession, resetSiteStop } from '../../lib/scraper/auth.js';
import { fetchAppointmentDetails } from '../../lib/scraper/extraction.js';
import { fetchAndStoreBoardingForm } from '../../lib/scraper/forms.js';
import { mapAndSaveAppointment } from '../../lib/scraper/mapping.js';

const SITE = SCRAPER_CONFIG.baseUrl;
const res = (status, location = null) => ({ status, headers: { get: (n) => (n.toLowerCase() === 'location' ? location : null) } });

// The schedule's week page: many pets, a week heading, no #when-wrapper (the shape of all 74 rows, 2026-10-23)
const WEEK_PAGE = `<html><head><title>Schedule | A Girl and Your Dog</title></head><body>
  <h1>Oct 18-24, 2026</h1>
  <a href="/schedule/a/C63QAAAA/1792836000"><div class="event-pets"><div class="event-pet-wrapper" data-pet="10001"><span class="event-pet">Dog A</span></div></div></a>
  <a href="/schedule/a/C63QAAAB/1792836000"><div class="event-pets"><div class="event-pet-wrapper" data-pet="10002"><span class="event-pet">Dog B</span></div></div></a>
</body></html>`;

// A booking page: dates on #when-wrapper (2026-10-24 10:00 → 2026-10-27 10:00 UTC)
const BOOKING_PAGE = `<html><head><title>10/24-27 | A Girl and Your Dog</title></head><body>
  <h1>10/24-27</h1>
  <div class="dt-row" id="when-wrapper" data-start_scheduled="1792836000" data-end_scheduled="1793095200"></div>
  <div class="event-clients-pets" data-uid="10003"><div class="event-pets pets-count-1" data-pets="10001">
    <div class="event-pet-wrapper" data-pet="10001"><a href="/pets/10001" class="event-pet pet-10001" data-pet="10001">Dog A</a></div>
  </div></div>
</body></html>`;

const ROUTES = {
  '/schedule/a/C63QGONE/1792836000': [302, { location: '/schedule' }, ''],
  '/schedule/a/C63QLOGN/1792836000': [302, { location: '/login' }, ''],
  '/schedule/a/C63QELSE/1792836000': [302, { location: '/clients/10003' }, ''],
  '/schedule/a/C63QGOOD/1792836000': [200, { 'content-type': 'text/html' }, BOOKING_PAGE],
  '/schedule': [200, { 'content-type': 'text/html' }, WEEK_PAGE],
  '/pets/10001/forms': [302, { location: '/schedule' }, ''],
  '/pets/10002/forms': [302, { location: '/login' }, ''],
  // A forms list with one submission in the week before arrival, whose page redirects
  '/pets/10004/forms': [200, { 'content-type': 'text/html' }, '<table><tr><td>10/20/2026</td><td><a href="/pets/10004/forms/7913/view/555">View</a></td></tr></table>'],
  '/pets/10004/forms/7913/view/555': [302, { location: '/schedule' }, ''],
};

let server;
let localBase;
let requested;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = http.createServer((req, reply) => {
    requested.push(req.url);
    const [status, headers, body] = ROUTES[req.url] ?? [404, {}, 'not found'];
    reply.writeHead(status, headers);
    reply.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  localBase = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  requested = [];
  resetSiteStop();
  setSession('session=test');
  // Every booking-site URL goes to the local server; the options (redirect included) pass through untouched
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, options) => realFetch(String(url).replace(SITE, localBase), options));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('REQ-660: classifyRedirect', () => {
  it('a 200 is not a redirect', () => {
    expect(classifyRedirect(res(200))).toBe(null);
  });

  it('a 404 is not a redirect', () => {
    expect(classifyRedirect(res(404, '/schedule'))).toBe(null);
  });

  it('a response with no status is not a redirect', () => {
    expect(classifyRedirect({ headers: { get: () => '/schedule' } })).toBe(null);
  });

  it('a 302 to /schedule is the schedule', () => {
    expect(classifyRedirect(res(302, '/schedule'))).toBe('schedule');
  });

  it('a 301 to the full booking-site /schedule URL is the schedule', () => {
    expect(classifyRedirect(res(301, `${SITE}/schedule`))).toBe('schedule');
  });

  it('a 302 to a week of the schedule is elsewhere, not the schedule', () => {
    expect(classifyRedirect(res(302, '/schedule/days-7/2026/10/18'))).toBe('elsewhere');
  });

  it('a 302 to /schedule on another host is elsewhere', () => {
    expect(classifyRedirect(res(302, 'https://other.example/schedule'))).toBe('elsewhere');
  });

  it('a 302 to /login is the login page', () => {
    expect(classifyRedirect(res(302, '/login'))).toBe('login');
  });

  it('a 302 to /login/ is the login page', () => {
    expect(classifyRedirect(res(302, '/login/'))).toBe('login');
  });

  it('a 302 to a path that only ends in /login is elsewhere', () => {
    expect(classifyRedirect(res(302, '/clients/login'))).toBe('elsewhere');
  });

  it('a 302 to /login-help is elsewhere', () => {
    expect(classifyRedirect(res(302, '/login-help'))).toBe('elsewhere');
  });

  it('a 302 with no Location is elsewhere', () => {
    expect(classifyRedirect(res(302, null))).toBe('elsewhere');
  });

  it('a 302 with an unparseable Location is elsewhere', () => {
    expect(classifyRedirect(res(302, 'http://[bad'))).toBe('elsewhere');
  });

  it('a 399 is a redirect and a 300 is a redirect (the 3xx range)', () => {
    expect(classifyRedirect(res(399, '/schedule'))).toBe('schedule');
    expect(classifyRedirect(res(300, '/schedule'))).toBe('schedule');
  });

  it('reconciliation still reads a 302 to /schedule as gone, and the login page as unexpected', () => {
    expect(classifyCandidateResponse(res(302, '/schedule'), '')).toBe('gone');
    expect(classifyCandidateResponse(res(302, '/login'), '')).toBe('unexpected');
  });
});

describe('REQ-660: Node fetch and redirects (real, against a local server)', () => {
  it('with redirect: manual, Node returns the 302 itself with its Location readable', async () => {
    const response = await realFetch(`${localBase}/schedule/a/C63QGONE/1792836000`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/schedule');
    expect(classifyRedirect(response)).toBe('schedule');
  });

  it('without it, Node follows the 302 and hands back the week page as 200 (the #344 bug)', async () => {
    const response = await realFetch(`${localBase}/schedule/a/C63QGONE/1792836000`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Oct 18-24, 2026');
  });
});

describe('REQ-660: fetchAppointmentDetails', () => {
  it('a booking URL that redirects to /schedule throws DetailRedirected, and the schedule is never fetched', async () => {
    const err = await fetchAppointmentDetails('C63QGONE', '1792836000').catch((e) => e);
    expect(err).toBeInstanceOf(DetailRedirected);
    expect(err.kind).toBe('schedule');
    expect(err.location).toBe('/schedule');
    expect(err.name).toBe('DetailRedirected');
    expect(err.message).toBe('Booking page redirected to /schedule');
    expect(requested).toEqual(['/schedule/a/C63QGONE/1792836000']);
  });

  it('a redirect with no Location is named as going nowhere', () => {
    expect(new DetailRedirected('elsewhere', null).message).toBe('Booking page redirected to nowhere');
  });

  it('the session-expired message is the one runDetailSync matches to clear the session', () => {
    expect(SESSION_EXPIRED_MESSAGE).toBe('Session expired. Re-authentication required.');
  });

  it('a booking URL that redirects to /login throws the session-expired message', async () => {
    const err = await fetchAppointmentDetails('C63QLOGN', '1792836000').catch((e) => e);
    expect(err).not.toBeInstanceOf(DetailRedirected);
    expect(err.message).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('a booking URL that redirects anywhere else throws DetailRedirected elsewhere, with the target', async () => {
    const err = await fetchAppointmentDetails('C63QELSE', '1792836000').catch((e) => e);
    expect(err).toBeInstanceOf(DetailRedirected);
    expect(err.kind).toBe('elsewhere');
    expect(err.location).toBe('/clients/10003');
  });

  it('a booking page that answers 200 is still read, with its dates', async () => {
    const data = await fetchAppointmentDetails('C63QGOOD', '1792836000');
    expect(data.external_id).toBe('C63QGOOD');
    expect(data.check_in_datetime).toBe('2026-10-24T10:00:00.000Z');
    expect(data.check_out_datetime).toBe('2026-10-27T10:00:00.000Z');
  });
});

describe('REQ-660: boarding form pages', () => {
  // Any database call would mean a form was stored: these tests must end before one
  const noDb = { from: () => { throw new Error('nothing may be written'); } };

  it('a forms list that redirects to /schedule fails the form job and stores nothing', async () => {
    const err = await fetchAndStoreBoardingForm(noDb, 'b1', '10001', 'Dog A').catch((e) => e);
    expect(err.message).toBe('Booking site redirected the forms list for pet 10001 (302) to /schedule');
    expect(requested).toEqual(['/pets/10001/forms']);
  });

  it('a form page that redirects fails the form job after the list was read, and stores nothing', async () => {
    const boardingOnly = {
      from: (table) => {
        if (table !== 'boardings') throw new Error('nothing may be written');
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'b4', arrival_datetime: '2026-10-24T10:00:00.000Z', departure_datetime: '2026-10-27T10:00:00.000Z' }, error: null }) }) }) };
      },
    };
    const err = await fetchAndStoreBoardingForm(boardingOnly, 'b4', '10004', 'Dog D').catch((e) => e);
    expect(err.message).toBe('Booking site redirected the form 555 (302) to /schedule');
    expect(requested).toEqual(['/pets/10004/forms', '/pets/10004/forms/7913/view/555']);
  });

  it('a forms list that redirects to /login throws the session-expired message', async () => {
    const err = await fetchAndStoreBoardingForm(noDb, 'b2', '10002', 'Dog B').catch((e) => e);
    expect(err.message).toBe(SESSION_EXPIRED_MESSAGE);
  });
});

describe('REQ-660: a page with no dates writes nothing', () => {
  const noDb = { from: () => { throw new Error('nothing may be written'); } };
  const page = (over) => ({
    external_id: 'C63QAAAA', pet_name: 'Dog A', all_pet_names: ['Dog A', 'Dog B'],
    check_in_datetime: '2026-10-24T10:00:00.000Z', check_out_datetime: '2026-10-27T10:00:00.000Z', ...over,
  });

  it('no check-in and no check-out: skipped as dateless_page, no dog, boarding or sync row', async () => {
    const result = await mapAndSaveAppointment(page({ check_in_datetime: null, check_out_datetime: null }), { supabase: noDb, externalPetId: '10001' });
    expect(result.skipped).toBe('dateless_page');
    expect(result.dog).toBe(null);
    expect(result.boarding).toBe(null);
    expect(result.syncAppointment).toBe(null);
  });

  it('a check-in without a check-out is skipped too', async () => {
    const result = await mapAndSaveAppointment(page({ check_out_datetime: null }), { supabase: noDb });
    expect(result.skipped).toBe('dateless_page');
  });

  it('a check-out without a check-in is skipped too', async () => {
    const result = await mapAndSaveAppointment(page({ check_in_datetime: null }), { supabase: noDb });
    expect(result.skipped).toBe('dateless_page');
  });
});
