/**
 * loginToSite: the one booking-site login, used by cron-auth and Clear (#324 part B).
 * Expected values come from REQ-657 and Kate's decisions: only a lockout risk (a rejected login,
 * a 429/403) trips the breaker; nothing logs in while it's tripped.
 * @requirements REQ-657
 *
 * Boundaries faked: the booking site's login (authenticate), Supabase (fakeSiteAccessDb) and
 * Kate's alert channel (alertAndLog).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSiteAccessDb } from './fakeSiteAccessDb.js';

const authenticate = vi.fn();
vi.mock('../../lib/scraper/auth.js', () => ({ authenticate: (...a) => authenticate(...a) }));
const alertAndLog = vi.fn(async () => true);
vi.mock('../../lib/alertKate.js', () => ({ alertAndLog: (...a) => alertAndLog(...a) }));

const { loginToSite } = await import('../../lib/scraper/siteLogin.js');

const ENV = { EXTERNAL_SITE_USERNAME: 'app-user', EXTERNAL_SITE_PASSWORD: 'pw' };
const open = () => fakeSiteAccessDb({ session_cookies: null, session_expires_at: null, blocked_at: null, blocked_reason: null });

beforeEach(() => {
  authenticate.mockReset();
  alertAndLog.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('REQ-657: loginToSite', () => {
  it('logs in with the configured credentials and stores the session', async () => {
    authenticate.mockResolvedValue({ success: true, cookies: 'sid=new' });
    const db = open();
    const result = await loginToSite(db, { env: ENV });
    expect(authenticate).toHaveBeenCalledWith('app-user', 'pw');
    expect(result.ok).toBe(true);
    expect(result.expiresAt).toBe(db.state.row.session_expires_at);
    expect(db.state.row.session_cookies).toBe('sid=new');
  });

  it('while the breaker is tripped it does not log in', async () => {
    const db = fakeSiteAccessDb({ blocked_at: '2026-10-21T07:05:00Z', blocked_reason: 'it refused the login' });
    const result = await loginToSite(db, { env: ENV });
    expect(result).toEqual({ ok: false, blocked: true, error: 'Booking site blocked since 2026-10-21T07:05:00Z: it refused the login' });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('a failed site_access read throws before any login (fails closed)', async () => {
    await expect(loginToSite(fakeSiteAccessDb(null, { readError: 'timeout' }), { env: ENV })).rejects.toThrow('site_access read failed: timeout');
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('a rejected login trips the breaker with the password advice, and stores no session', async () => {
    authenticate.mockResolvedValue({ success: false, error: 'Invalid credentials', rejected: true });
    const db = open();
    const result = await loginToSite(db, { env: ENV });
    expect(result).toEqual({ ok: false, tripped: true, error: 'Authentication failed: Invalid credentials' });
    expect(db.state.row.blocked_reason).toBe('it refused the login');
    expect(db.state.row.session_cookies).toBeNull();
    expect(alertAndLog).toHaveBeenCalledTimes(1);
    expect(alertAndLog.mock.calls[0][2]).toContain('Update the password in Vercel before you press Clear.');
  });

  it('a 429 on the login trips the breaker, without the password advice', async () => {
    authenticate.mockResolvedValue({ success: false, error: 'Login answered 429', throttled: true, status: 429 });
    const db = open();
    const result = await loginToSite(db, { env: ENV });
    expect(result.tripped).toBe(true);
    expect(db.state.row.blocked_reason).toBe('it answered 429 (too many requests) on the login page');
    expect(alertAndLog.mock.calls[0][2]).not.toContain('password');
  });

  it('a 5xx or network failure fails without tripping', async () => {
    authenticate.mockResolvedValue({ success: false, error: 'Login failed with status 502' });
    const db = open();
    const result = await loginToSite(db, { env: ENV });
    expect(result).toEqual({ ok: false, tripped: false, error: 'Authentication failed: Login failed with status 502' });
    expect(db.state.row.blocked_at).toBeNull();
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it.each([
    ['username', { EXTERNAL_SITE_PASSWORD: 'pw' }],
    ['password', { EXTERNAL_SITE_USERNAME: 'app-user' }],
  ])('a missing %s fails without trying to log in or tripping', async (_what, env) => {
    const db = open();
    const result = await loginToSite(db, { env });
    expect(result.ok).toBe(false);
    expect(result.tripped).toBe(false);
    expect(result.error).toMatch(/credentials not configured/);
    expect(authenticate).not.toHaveBeenCalled();
    expect(db.state.row.blocked_at).toBeNull();
  });
});
