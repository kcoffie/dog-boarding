/**
 * The browser's sync-proxy calls carry the signed-in user's Supabase token, read fresh on every call.
 * Expected values come from REQ-656's acceptance criteria.
 * @requirements REQ-656, REQ-657
 *
 * Boundaries faked: the Supabase client's getSession (src/lib/supabase.js) and fetch to /api/sync-proxy.
 * isBrowser() is true here because MODE is stubbed away from 'test' (jsdom provides window).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getSession = vi.fn();
vi.mock('../../lib/supabase.js', () => ({ supabase: { auth: { getSession } } }));

const { authenticatedFetch, clearSession, SiteThrottled, SiteBlocked, resetSiteStop } = await import('../../lib/scraper/auth.js');

const fetchFn = vi.fn();
const PAGE = 'https://agirlandyourdog.com/schedule';

function session(token) {
  return { data: { session: token ? { access_token: token } : null } };
}

const proxyAnswers = (body) => ({ json: async () => body });

beforeEach(() => {
  vi.stubEnv('MODE', 'production');
  vi.stubGlobal('fetch', fetchFn);
  fetchFn.mockReset();
  getSession.mockReset();
  clearSession();
  resetSiteStop(); // as runSync does at the start of every run
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('REQ-656: browser → sync-proxy auth', () => {
  it("a proxied fetch sends the signed-in user's access token as the Bearer header", async () => {
    getSession.mockResolvedValue(session('jwt-1'));
    fetchFn.mockResolvedValue(proxyAnswers({ success: true, status: 200, html: '<p>ok</p>' }));
    await authenticatedFetch(PAGE);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/sync-proxy');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer jwt-1' });
  });

  it('every proxied fetch reads the session again, so a refreshed token is used', async () => {
    getSession.mockResolvedValueOnce(session('jwt-1')).mockResolvedValueOnce(session('jwt-2'));
    fetchFn.mockResolvedValue(proxyAnswers({ success: true, status: 200, html: '<p>ok</p>' }));
    await authenticatedFetch(PAGE);
    await authenticatedFetch(PAGE);
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe('Bearer jwt-2');
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('signed out, no Authorization header is sent (the proxy then answers 401)', async () => {
    getSession.mockResolvedValue(session(null));
    fetchFn.mockResolvedValue(proxyAnswers({ error: 'Unauthorized' }));
    await authenticatedFetch(PAGE);
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('a getSession answer without data sends no Authorization header (and does not throw)', async () => {
    getSession.mockResolvedValue({});
    fetchFn.mockResolvedValue(proxyAnswers({ error: 'Unauthorized' }));
    await authenticatedFetch(PAGE);
    expect(fetchFn.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

/** @requirements REQ-657 */
describe('REQ-657: Sync Now in the browser never holds the session and stops when told to', () => {
  beforeEach(() => {
    getSession.mockResolvedValue(session('jwt-1'));
  });

  it('a proxied page fetch posts only { action: fetch, url, method: GET }: no cookie, no login', async () => {
    fetchFn.mockResolvedValue(proxyAnswers({ success: true, status: 200, html: '<p>ok</p>' }));
    await authenticatedFetch(PAGE);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ action: 'fetch', url: PAGE, method: 'GET' });
  });

  it('a 429 passed back by the proxy throws SiteThrottled, and the next fetch makes no call', async () => {
    fetchFn.mockResolvedValueOnce(proxyAnswers({ success: false, status: 429, html: '' }));
    await expect(authenticatedFetch(PAGE)).rejects.toBeInstanceOf(SiteThrottled);
    await expect(authenticatedFetch(PAGE)).rejects.toBeInstanceOf(SiteThrottled);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a blocked answer throws SiteBlocked, which stops the run as a 429 does, and the next fetch makes no call', async () => {
    fetchFn.mockResolvedValueOnce(proxyAnswers({ success: false, blocked: true, error: 'blocked' }));
    const err = await authenticatedFetch(PAGE).catch(e => e);
    expect(err).toBeInstanceOf(SiteBlocked);
    expect(err).toBeInstanceOf(SiteThrottled);
    await expect(authenticatedFetch(PAGE)).rejects.toBeInstanceOf(SiteBlocked);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('no stored session fails the request with the proxy\'s reason', async () => {
    fetchFn.mockResolvedValueOnce(proxyAnswers({ success: false, noSession: true, error: 'No booking-site session stored' }));
    await expect(authenticatedFetch(PAGE)).rejects.toThrow('No booking-site session stored');
  });

  it("a redirect's status and Location come back from the proxy", async () => {
    fetchFn.mockResolvedValueOnce(proxyAnswers({ success: false, status: 302, html: '', location: 'https://agirlandyourdog.com/schedule' }));
    const res = await authenticatedFetch('https://agirlandyourdog.com/schedule/a/ABC/1', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://agirlandyourdog.com/schedule');
  });
});
