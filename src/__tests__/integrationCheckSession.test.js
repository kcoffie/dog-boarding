/**
 * integration-check loadSession: the browser check uses the stored session and never logs in, and
 * makes no request while the booking-site breaker is tripped (#324, REQ-657).
 * @requirements REQ-657
 *
 * Boundary faked: Supabase (fakeSiteAccessDb).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSiteAccessDb } from './scraper/fakeSiteAccessDb.js';

vi.mock('../lib/alertKate.js', async (importOriginal) => ({ ...(await importOriginal()), alertAndLog: vi.fn(async () => true) }));

const { loadSession } = await import('../../scripts/integration-check.js');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('REQ-657: integration-check loadSession', () => {
  it('returns the stored cookie', async () => {
    const db = fakeSiteAccessDb({ session_cookies: 'sid=1', session_expires_at: '2099-01-01T00:00:00Z', blocked_at: null });
    expect(await loadSession(db)).toEqual({ cookies: 'sid=1' });
  });

  it('while the breaker is tripped it says blocked, so the check skips the browser load', async () => {
    const db = fakeSiteAccessDb({ session_cookies: 'sid=1', session_expires_at: '2099-01-01T00:00:00Z', blocked_at: '2026-10-22T00:05:00Z', blocked_reason: 'r' });
    expect(await loadSession(db)).toEqual({ blocked: true });
  });

  it('with no usable session it returns null (the check reports "skipped")', async () => {
    const db = fakeSiteAccessDb({ session_cookies: 'sid=1', session_expires_at: '2020-01-01T00:00:00Z', blocked_at: null });
    expect(await loadSession(db)).toBeNull();
  });

  it('a failed read throws rather than guessing', async () => {
    await expect(loadSession(fakeSiteAccessDb(null, { readError: 'timeout' }))).rejects.toThrow('site_access read failed: timeout');
  });
});

describe('REQ-657: a 429/403 on the browser check\'s page load trips the breaker', () => {
  it('trips it naming the status and the schedule page, and exits 0 (the breaker alerted)', async () => {
    const { stopOnThrottle, PageThrottled } = await import('../../scripts/integration-check.js');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = fakeSiteAccessDb({ session_cookies: 'sid=1', session_expires_at: '2099-01-01T00:00:00Z', blocked_at: null, blocked_reason: null });
    const code = await stopOnThrottle(db, new PageThrottled(429, 'https://agirlandyourdog.com/schedule'));
    expect(code).toBe(0);
    expect(db.state.row.blocked_reason).toBe('it answered 429 (too many requests) on a schedule page');
  });
});
