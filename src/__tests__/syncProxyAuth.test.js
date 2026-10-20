/**
 * api/sync-proxy.js: only a signed-in user may use it, and it only reads from the booking site.
 * Expected values come from REQ-656's acceptance criteria.
 * @requirements REQ-656
 *
 * Boundaries faked (global fetch): Supabase's GET /auth/v1/user, answering with its documented
 * shapes, and the booking site, answering with a small HTML page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../../api/sync-proxy.js';

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
    const res = await handler(proxyRequest({ action: 'authenticate' }, 'server-token'));
    expect(res.status).toBe(401);
    expect(bookingSiteCalls()).toHaveLength(0);
  });

  it("the authenticate action (which returns the booking-site session) needs a signed-in user too", async () => {
    const res = await handler(proxyRequest({ action: 'authenticate' }, 'not-a-user'));
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
