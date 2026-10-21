/**
 * api/sync-proxy.js: only a signed-in user may use it, it only reads the booking site's sync pages,
 * and it keeps the session on the server and obeys the breaker.
 * Expected values come from REQ-656's and REQ-657's acceptance criteria.
 * @requirements REQ-656, REQ-657
 *
 * Boundaries faked: global fetch (Supabase's GET /auth/v1/user, answering with its documented
 * shapes, and the booking site, answering with a small HTML page), the site_access table
 * (fakeSiteAccessDb) and Kate's alert channel (alertAndLog).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSiteAccessDb } from './scraper/fakeSiteAccessDb.js';

const alertAndLog = vi.fn(async () => true);
vi.mock('../lib/alertKate.js', () => ({ alertAndLog: (...a) => alertAndLog(...a) }));

const { makeHandler, isSyncUrl } = await import('../../api/sync-proxy.js');

const STORED = 'sid=stored-session';
const LATER = '2099-01-01T00:00:00.000Z';
let db;
let handler;

const SUPABASE_URL = 'https://db.example.com';
const USER_JWT = 'user-jwt';
const PAGE = '<html><body>schedule</body></html>';

let fetchFn;

/** Supabase answers 200 + a user for USER_JWT (401 otherwise); the booking site answers PAGE. */
function fakeFetch({ authStatus = null } = {}) {
  return vi.fn(async (url, init = {}) => {
    if (url === `${SUPABASE_URL}/auth/v1/user`) {
      if (authStatus) return { status: authStatus, json: async () => ({}) };
      return init.headers.Authorization === `Bearer ${USER_JWT}`
        ? { status: 200, json: async () => ({ id: 'user-1', email: 'staff-a@example.com' }) }
        : { status: 401, json: async () => ({ msg: 'invalid JWT' }) };
    }
    return { ok: true, status: 200, text: async () => PAGE, headers: new Headers() };
  });
}

function proxyRequest(body, token = USER_JWT) {
  return new Request('https://app.example.com/api/sync-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

const bookingSiteCalls = () => fetchFn.mock.calls.filter(([url]) => String(url).includes('agirlandyourdog.com'));

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = SUPABASE_URL;
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.INTERNAL_API_TOKEN;
  fetchFn = fakeFetch();
  vi.stubGlobal('fetch', fetchFn);
  alertAndLog.mockClear();
  db = fakeSiteAccessDb({ session_cookies: STORED, session_expires_at: LATER, blocked_at: null, blocked_reason: null });
  handler = makeHandler({ getDb: () => db });
});

describe('REQ-656: sync-proxy needs a signed-in user', () => {
  it('a signed-in user can fetch a booking-site page with GET', async () => {
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    expect(res.status).toBe(200);
    expect((await res.json()).html).toBe(PAGE);
    expect(bookingSiteCalls()).toHaveLength(1);
    expect(bookingSiteCalls()[0][0]).toBe('https://agirlandyourdog.com/schedule');
    expect(bookingSiteCalls()[0][1].method).toBe('GET');
  });

  it('no Authorization header → 401 JSON "Unauthorized", and the booking site is never called', async () => {
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }, null));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it('the old shared server token is not accepted → 401', async () => {
    process.env.INTERNAL_API_TOKEN = 'server-token';
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }, 'server-token'));
    expect(res.status).toBe(401);
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it("when Supabase's sign-in check is down → 503, and the booking site is never called", async () => {
    fetchFn = fakeFetch({ authStatus: 502 });
    vi.stubGlobal('fetch', fetchFn);
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    expect(res.status).toBe(503);
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it('without the Supabase settings → 500 (fails closed, no local-dev skip)', async () => {
    delete process.env.VITE_SUPABASE_ANON_KEY;
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    expect(res.status).toBe(500);
    expect(bookingSiteCalls()).toHaveLength(0);
  });
});

describe('REQ-656: sync-proxy only reads', () => {
  it('a fetch with method POST → 400 "Only GET is allowed", and the booking site is never called', async () => {
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule', method: 'POST' }));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ success: false, error: 'Only GET is allowed' });
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it('a fetch with method DELETE → 400', async () => {
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule', method: 'DELETE' }));
    expect(res.status).toBe(400);
    expect(bookingSiteCalls()).toHaveLength(0);
  });
});

/** @requirements REQ-657 */
describe('REQ-657: the session stays on the server', () => {
  it('the stored session is sent to the booking site, not one from the browser', async () => {
    await handler(proxyRequest({ action: 'fetch', url: '/schedule', cookies: 'sid=from-browser' }));
    expect(bookingSiteCalls()[0][1].headers.Cookie).toBe(STORED);
  });

  it('the answer never carries the session or a Set-Cookie', async () => {
    fetchFn.mockImplementationOnce(fakeFetch()).mockImplementationOnce(async () => ({
      ok: true, status: 200, text: async () => PAGE, headers: new Headers({ 'set-cookie': 'sid=new-from-site' }),
    }));
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    const text = await res.text();
    expect(text).not.toContain('stored-session');
    expect(text).not.toContain('new-from-site');
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['html', 'location', 'status', 'success']);
  });

  it('there is no login action: authenticate → 400, and the booking site is never called', async () => {
    const res = await handler(proxyRequest({ action: 'authenticate' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Unknown action: authenticate' });
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it('no stored session → 503 noSession, and the booking site is never called', async () => {
    db = fakeSiteAccessDb({ session_cookies: null, session_expires_at: null, blocked_at: null });
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    expect(res.status).toBe(503);
    expect((await res.json()).noSession).toBe(true);
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it('a failed site_access read → 500, and the booking site is never called (fails closed)', async () => {
    db = fakeSiteAccessDb(null, { readError: 'timeout' });
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    expect(res.status).toBe(500);
    expect(bookingSiteCalls()).toHaveLength(0);
  });
});

/** @requirements REQ-657 */
describe('REQ-657: sync-proxy obeys the breaker and trips it', () => {
  it('while tripped → 423 blocked, and the booking site is never called', async () => {
    db = fakeSiteAccessDb({ session_cookies: STORED, session_expires_at: LATER, blocked_at: '2026-10-22T07:05:00Z', blocked_reason: 'it refused the login' });
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    expect(res.status).toBe(423);
    expect((await res.json()).blocked).toBe(true);
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it.each([
    [429, 'it answered 429 (too many requests) on a booking page'],
    [403, 'it answered 403 (refused) on a booking page'],
  ])('a %i trips the breaker with its reason and alerts once', async (status, reason) => {
    fetchFn.mockImplementation(async (url, init) => (String(url).includes('agirlandyourdog.com')
      ? { ok: false, status, text: async () => '', headers: new Headers() }
      : fakeFetch()(url, init)));
    const first = await handler(proxyRequest({ action: 'fetch', url: '/schedule/a/ABC/1' }));
    expect((await first.json()).status).toBe(status);
    expect(db.state.row.blocked_reason).toBe(reason);
    expect(alertAndLog).toHaveBeenCalledTimes(1);
    expect(alertAndLog.mock.calls[0][1]).toBe('site-access');

    // A second press is refused before reaching the site, so no second alert
    const second = await handler(proxyRequest({ action: 'fetch', url: '/schedule/a/ABC/1' }));
    expect(second.status).toBe(423);
    expect(bookingSiteCalls()).toHaveLength(1);
    expect(alertAndLog).toHaveBeenCalledTimes(1);
  });

  it('a 500 does not trip the breaker', async () => {
    fetchFn.mockImplementationOnce(fakeFetch()).mockImplementationOnce(async () => ({
      ok: false, status: 500, text: async () => '', headers: new Headers(),
    }));
    await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    expect(db.state.row.blocked_at).toBeNull();
    expect(alertAndLog).not.toHaveBeenCalled();
  });
});

/** @requirements REQ-657 */
describe('REQ-657: sync-proxy fetches only the sync pages and follows no redirects', () => {
  it('a redirect is not followed: its status and Location come back', async () => {
    fetchFn.mockImplementationOnce(fakeFetch()).mockImplementationOnce(async () => ({
      ok: false, status: 302, text: async () => 'Redirecting...',
      headers: new Headers({ location: 'https://agirlandyourdog.com/schedule' }),
    }));
    const res = await handler(proxyRequest({ action: 'fetch', url: '/schedule/a/ABC/1' }));
    const body = await res.json();
    expect(bookingSiteCalls()[0][1].redirect).toBe('manual');
    expect(body.status).toBe(302);
    expect(body.location).toBe('https://agirlandyourdog.com/schedule');
  });

  it('a schedule page is fetched without following redirects too', async () => {
    await handler(proxyRequest({ action: 'fetch', url: '/schedule' }));
    expect(bookingSiteCalls()[0][1].redirect).toBe('manual');
  });

  it('a path outside the sync pages → 403 "URL not allowed", and the booking site is never called', async () => {
    const res = await handler(proxyRequest({ action: 'fetch', url: '/login' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: 'URL not allowed' });
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it.each([
    '/schedule',
    '/schedule/days-7/2026/10/5',
    'https://agirlandyourdog.com/schedule/days-7/2026/10/19',
    '/schedule/a/C63QhHuu/1761000000',
    '/schedule/a/C63QhHuu',
    '/pets/10008/forms',
    '/pets/10008/forms/7913/view/143',
  ])('allowed: %s', (url) => {
    expect(isSyncUrl(url)).toBe(true);
  });

  it.each([
    '/login',
    '/logout',
    '/settings',
    '/schedule/a/C63QhHuu/1761000000/edit',
    '/pets/10008',
    '/schedule/days-7/2026/10',
    'https://evil.example/schedule',
    '//evil.example/schedule',
    'http://agirlandyourdog.com/schedule',
    'https://agirlandyourdog.com.evil.example/schedule',
  ])('refused: %s', (url) => {
    expect(isSyncUrl(url)).toBe(false);
  });
});
