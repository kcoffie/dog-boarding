/**
 * The site_access table: the stored booking-site session and the breaker (#324 part B).
 * Expected values come from REQ-657's acceptance criteria and Kate's decisions in
 * docs/specs/sync-redesign-design-note.md ("Before any unattended run").
 * @requirements REQ-657
 *
 * Boundaries faked: Supabase (fakeSiteAccessDb, which applies PostgREST's filters) and Kate's alert
 * channel (alertAndLog).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeSiteAccessDb } from './fakeSiteAccessDb.js';

const alertAndLog = vi.fn(async () => true);
vi.mock('../../lib/alertKate.js', () => ({ alertAndLog: (...a) => alertAndLog(...a) }));

const {
  getSiteSession, storeSiteSession, clearSiteSession, tripBreaker, clearBreaker, readSiteAccess,
  breakerAlertText, throttleReason, describeSitePath, SiteAccessError, SESSION_TTL_MS,
} = await import('../../lib/scraper/siteAccess.js');

const NOW = new Date('2026-10-22T00:05:00Z'); // 17:05 PDT
const LATER = '2026-10-23T00:00:00.000Z';
const EARLIER = '2026-10-21T00:00:00.000Z';

beforeEach(() => {
  alertAndLog.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

const stored = (over = {}) => fakeSiteAccessDb({
  session_cookies: 'sid=1', session_expires_at: LATER, blocked_at: null, blocked_reason: null, ...over,
});

async function codeOf(promise) {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(SiteAccessError);
  return err.code;
}

describe('getSiteSession: the one way a run gets the session; it never logs in', () => {
  it('returns the stored cookie while its stamp is in the future', async () => {
    expect(await getSiteSession(stored())).toBe('sid=1');
  });

  it('a session whose stamp has passed is NO_SESSION', async () => {
    expect(await codeOf(getSiteSession(stored({ session_expires_at: EARLIER })))).toBe('NO_SESSION');
  });

  it('a session whose stamp is exactly now is NO_SESSION', async () => {
    expect(await codeOf(getSiteSession(stored({ session_expires_at: NOW.toISOString() })))).toBe('NO_SESSION');
  });

  it('no cookie is NO_SESSION', async () => {
    expect(await codeOf(getSiteSession(stored({ session_cookies: null })))).toBe('NO_SESSION');
  });

  it('a cookie with no stamp is NO_SESSION', async () => {
    expect(await codeOf(getSiteSession(stored({ session_expires_at: null })))).toBe('NO_SESSION');
  });

  it('an empty table is NO_SESSION', async () => {
    expect(await codeOf(getSiteSession(fakeSiteAccessDb(null)))).toBe('NO_SESSION');
  });

  it('while the breaker is tripped it is SITE_BLOCKED, even with a good session', async () => {
    const db = stored({ blocked_at: '2026-10-21T07:05:00Z', blocked_reason: 'it refused the login' });
    expect(await codeOf(getSiteSession(db))).toBe('SITE_BLOCKED');
  });

  it('a failed read throws (fails closed), never "not blocked"', async () => {
    const db = fakeSiteAccessDb(null, { readError: 'timeout' });
    await expect(getSiteSession(db)).rejects.toThrow('site_access read failed: timeout');
  });

  it('reads the one row by its key', async () => {
    const db = stored();
    const from = vi.spyOn(db, 'from');
    await readSiteAccess(db);
    expect(from).toHaveBeenCalledWith('site_access');
  });
});

describe('storing and clearing the session', () => {
  it('a stored session is good for 30 hours (Kate, 2026-10-21)', async () => {
    const db = stored({ session_cookies: null, session_expires_at: null });
    const expiresAt = await storeSiteSession(db, 'sid=new');
    expect(expiresAt).toBe('2026-10-23T06:05:00.000Z');
    expect(SESSION_TTL_MS).toBe(30 * 3600 * 1000);
    expect(db.state.row.session_cookies).toBe('sid=new');
    expect(db.state.row.session_expires_at).toBe('2026-10-23T06:05:00.000Z');
  });

  it('storing into an empty table creates the one row', async () => {
    const db = fakeSiteAccessDb(null);
    await storeSiteSession(db, 'sid=new');
    expect(db.state.row.id).toBe(true);
    expect(await getSiteSession(db)).toBe('sid=new');
  });

  it('storing leaves the breaker as it was', async () => {
    const db = stored({ blocked_at: '2026-10-21T07:05:00Z', blocked_reason: 'r' });
    await storeSiteSession(db, 'sid=new');
    expect(db.state.row.blocked_at).toBe('2026-10-21T07:05:00Z');
  });

  it('a failed write throws', async () => {
    await expect(storeSiteSession(fakeSiteAccessDb(null, { writeError: 'denied' }), 'sid')).rejects.toThrow('site_access session write failed: denied');
  });

  it('clearing forgets the session, so the next run is NO_SESSION', async () => {
    const db = stored();
    await clearSiteSession(db);
    expect(await codeOf(getSiteSession(db))).toBe('NO_SESSION');
  });

  it('a failed clear throws', async () => {
    await expect(clearSiteSession(fakeSiteAccessDb({}, { writeError: 'denied' }))).rejects.toThrow('site_access session clear failed: denied');
  });
});

describe('tripBreaker: only a lockout risk trips it; the first trip wins and alerts once', () => {
  it('tripping records when and why, and sends one alert under site-access', async () => {
    const db = stored();
    expect(await tripBreaker(db, 'it answered 429 (too many requests) on a schedule page')).toBe(true);
    expect(db.state.row.blocked_at).toBe(NOW.toISOString());
    expect(db.state.row.blocked_reason).toBe('it answered 429 (too many requests) on a schedule page');
    expect(alertAndLog).toHaveBeenCalledTimes(1);
    expect(alertAndLog.mock.calls[0][0]).toBe(db);
    expect(alertAndLog.mock.calls[0][1]).toBe('site-access');
  });

  it('a second trip keeps the first reason and sends no second alert', async () => {
    const db = stored();
    await tripBreaker(db, 'first reason');
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(await tripBreaker(db, 'second reason')).toBe(false);
    expect(db.state.row.blocked_reason).toBe('first reason');
    expect(db.state.row.blocked_at).toBe(NOW.toISOString());
    expect(alertAndLog).toHaveBeenCalledTimes(1);
  });

  it("a trip that can't be recorded still alerts, saying the next run may try again", async () => {
    const db = fakeSiteAccessDb({}, { writeError: 'timeout' });
    expect(await tripBreaker(db, 'it refused the login')).toBe(true);
    expect(alertAndLog).toHaveBeenCalledTimes(1);
    expect(alertAndLog.mock.calls[0][2]).toContain("Couldn't record the block, so the next run may try again: timeout");
  });

  it('a rejected login alert tells Kate to update the password before Clear', async () => {
    await tripBreaker(stored(), 'it refused the login', { rejectedLogin: true });
    expect(alertAndLog.mock.calls[0][2]).toContain('Update the password in Vercel before you press Clear.');
  });

  it('a throttle alert does not mention the password', async () => {
    await tripBreaker(stored(), 'it answered 429 (too many requests) on a schedule page');
    expect(alertAndLog.mock.calls[0][2]).not.toContain('password');
  });
});

describe('the alert text', () => {
  it('says when (Pacific), why, that nothing contacts the site until Clear, where Clear is, and what the roster uses', () => {
    const lines = breakerAlertText('it answered 429 (too many requests) on a schedule page', {}, NOW).split('\n');
    expect(lines).toEqual([
      '⛔ Booking site blocked 17:05 PDT: it answered 429 (too many requests) on a schedule page.',
      'Nothing will contact the booking site until you press Clear in Settings: https://qboarding.vercel.app/settings',
      'The roster uses the data already in the app.',
    ]);
  });

  it('in winter the time is PST', () => {
    expect(breakerAlertText('r', {}, new Date('2026-12-01T01:30:00Z'))).toMatch(/^⛔ Booking site blocked 17:30 PST: r\./);
  });

  it('for a rejected login, the password line comes second', () => {
    expect(breakerAlertText('it refused the login', { rejectedLogin: true }, NOW).split('\n')[1])
      .toBe('Update the password in Vercel before you press Clear.');
  });
});

describe('clearBreaker: Kate\'s Clear, one conditional update', () => {
  const blocked = () => stored({ blocked_at: '2026-10-21T07:05:00Z', blocked_reason: 'it refused the login' });

  it('clears it and records who and when', async () => {
    const db = blocked();
    expect(await clearBreaker(db, 'kate@example.com')).toBe(true);
    expect(db.state.row.blocked_at).toBeNull();
    expect(db.state.row.blocked_reason).toBeNull();
    expect(db.state.row.cleared_by).toBe('kate@example.com');
    expect(db.state.row.cleared_at).toBe(NOW.toISOString());
  });

  it('a second press finds nothing to clear', async () => {
    const db = blocked();
    await clearBreaker(db, 'kate@example.com');
    expect(await clearBreaker(db, 'kate@example.com')).toBe(false);
  });

  it('when not blocked it changes nothing, not even who cleared it last', async () => {
    const db = stored({ cleared_by: 'earlier@example.com' });
    expect(await clearBreaker(db, 'kate@example.com')).toBe(false);
    expect(db.state.row.cleared_by).toBe('earlier@example.com');
  });

  it('a failed update throws', async () => {
    await expect(clearBreaker(fakeSiteAccessDb({}, { writeError: 'denied' }), 'k')).rejects.toThrow('site_access clear failed: denied');
  });
});

describe('naming what the site refused', () => {
  it.each([
    ['https://agirlandyourdog.com/schedule/days-7/2026/10/19', 'a schedule page'],
    ['https://agirlandyourdog.com/schedule', 'a schedule page'],
    ['https://agirlandyourdog.com/schedule/a/ABC/1', 'a booking page'],
    ['https://agirlandyourdog.com/pets/1/forms', 'a form page'],
    ['/login', 'the login page'],
    ['https://agirlandyourdog.com/other', 'a page'],
  ])('%s is %s', (url, what) => {
    expect(describeSitePath(url)).toBe(what);
  });

  it('429 is "too many requests"', () => {
    expect(throttleReason(429, '/schedule')).toBe('it answered 429 (too many requests) on a schedule page');
  });

  it('403 is "refused"', () => {
    expect(throttleReason(403, '/schedule/a/X')).toBe('it answered 403 (refused) on a booking page');
  });
});

// Stryker's sandbox leaves out supabase/ (stryker.config.json ignorePatterns); the SQL has no
// mutants, so these run in every normal test run and CI, and are skipped only there.
const MIGRATION = resolve(process.cwd(), 'supabase/migrations/028_add_site_access.sql');

const code = existsSync(MIGRATION)
  ? readFileSync(MIGRATION, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  : null;

describe.skipIf(code === null)('migration 028: only the server can read or write site_access', () => {
  it('turns row-level security on', () => {
    expect(code).toMatch(/ALTER TABLE site_access ENABLE ROW LEVEL SECURITY;/);
  });

  it('creates no policy, so anon and signed-in users get nothing', () => {
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toMatch(/GRANT/i);
  });

  it('allows one row only: the key is a boolean that must be true', () => {
    expect(code).toMatch(/id\s+boolean\s+PRIMARY KEY DEFAULT true CHECK \(id\)/);
  });
});
