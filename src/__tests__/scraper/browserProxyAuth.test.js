/**
 * The browser's sync-proxy calls carry the signed-in user's Supabase token, read fresh on every call.
 * Expected values come from REQ-656's acceptance criteria.
 * @requirements REQ-656
 *
 * Boundaries faked: the Supabase client's getSession (src/lib/supabase.js) and fetch to /api/sync-proxy.
 * isBrowser() is true here because MODE is stubbed away from 'test' (jsdom provides window).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getSession = vi.fn();
vi.mock('../../lib/supabase.js', () => ({ supabase: { auth: { getSession } } }));

const { authenticate, authenticatedFetch, clearSession } = await import('../../lib/scraper/auth.js');

const fetchFn = vi.fn();

function session(token) {
  return { data: { session: token ? { access_token: token } : null } };
}

beforeEach(() => {
  vi.stubEnv('MODE', 'production');
  vi.stubGlobal('fetch', fetchFn);
  fetchFn.mockReset();
  getSession.mockReset();
  clearSession();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('REQ-656: browser → sync-proxy auth', () => {
  it("authenticate sends the signed-in user's access token as the Bearer header", async () => {
    getSession.mockResolvedValue(session('jwt-1'));
    fetchFn.mockResolvedValue({ json: async () => ({ success: true, cookies: 'sid=1' }) });
    await authenticate();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/sync-proxy');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer jwt-1' });
  });

  it('every proxied fetch reads the session again, so a refreshed token is used', async () => {
    getSession.mockResolvedValueOnce(session('jwt-1')).mockResolvedValueOnce(session('jwt-2'));
    fetchFn
      .mockResolvedValueOnce({ json: async () => ({ success: true, cookies: 'sid=1' }) })
      .mockResolvedValueOnce({ json: async () => ({ success: true, status: 200, html: '<p>ok</p>' }) });
    await authenticate();
    await authenticatedFetch('https://agirlandyourdog.com/schedule');
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe('Bearer jwt-2');
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('a proxied page fetch posts { action: fetch, url, cookies, method: GET } to /api/sync-proxy', async () => {
    getSession.mockResolvedValue(session('jwt-1'));
    fetchFn
      .mockResolvedValueOnce({ json: async () => ({ success: true, cookies: 'sid=1' }) })
      .mockResolvedValueOnce({ json: async () => ({ success: true, status: 200, html: '<p>ok</p>' }) });
    await authenticate();
    await authenticatedFetch('https://agirlandyourdog.com/schedule');
    const [url, init] = fetchFn.mock.calls[1];
    expect(url).toBe('/api/sync-proxy');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ action: 'fetch', url: 'https://agirlandyourdog.com/schedule', cookies: 'sid=1', method: 'GET' });
  });

  it('signed out, no Authorization header is sent (the proxy then answers 401)', async () => {
    getSession.mockResolvedValue(session(null));
    fetchFn.mockResolvedValue({ json: async () => ({ success: false, error: 'Unauthorized' }) });
    await authenticate();
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('a getSession answer without data sends no Authorization header (and does not throw)', async () => {
    getSession.mockResolvedValue({});
    fetchFn.mockResolvedValue({ json: async () => ({ success: false, error: 'Unauthorized' }) });
    await authenticate();
    expect(fetchFn.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });
});
