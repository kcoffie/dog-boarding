/**
 * /api/site-access: the breaker on the Settings page and Kate's Clear (#324 part B).
 * Expected values come from REQ-657: GET never returns the session; Clear records who, clears once
 * for two presses and logs in at once; a refused login trips it again.
 * @requirements REQ-657, REQ-656
 *
 * Boundaries faked: the signed-in-user check (verifyUser), Supabase (fakeSiteAccessDb) and the
 * booking-site login (loginToSite; siteLogin.test.js covers it).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSiteAccessDb } from './scraper/fakeSiteAccessDb.js';
import defaultHandler, { makeHandler, config } from '../../api/site-access.js';

const USER = { id: 'user-1', email: 'kate@example.com' };
const BLOCKED = { session_cookies: 'sid=secret-cookie', session_expires_at: '2099-01-01T00:00:00Z', blocked_at: '2026-10-22T00:05:00.000Z', blocked_reason: 'it refused the login' };

let db;
let login;
let verify;
let handler;

function call(method, authorization = 'Bearer jwt') {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method, headers: { authorization } }, res).then(() => res);
}

beforeEach(() => {
  db = fakeSiteAccessDb(BLOCKED);
  login = vi.fn(async () => ({ ok: true, expiresAt: '2099-01-01T00:00:00Z' }));
  verify = vi.fn(async (h) => (h === 'Bearer jwt' ? { ok: true, user: USER } : { ok: false, status: 401, error: 'Unauthorized' }));
  handler = makeHandler({ getDb: () => db, login, verify });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

it('runs on the Node.js runtime (it logs in with the server credentials)', () => {
  expect(config).toStrictEqual({ runtime: 'nodejs' });
});

describe('REQ-656: only a signed-in user', () => {
  it.each(['GET', 'POST'])('%s without a signed-in user → 401, and nothing is read or changed', async (method) => {
    const res = await call(method, 'Bearer nope');
    expect(res.code).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'Unauthorized' });
    expect(db.state.row.blocked_at).toBe(BLOCKED.blocked_at);
    expect(login).not.toHaveBeenCalled();
  });

  it('other methods → 405', async () => {
    const res = await call('DELETE');
    expect(res.code).toBe(405);
    expect(res.body).toEqual({ ok: false, error: 'Method not allowed' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('without the Supabase service key → 500, nothing read and no login (fails closed)', async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITE_SUPABASE_URL = 'https://db.example.com';
    handler = makeHandler({ login, verify });
    const res = await call('POST');
    expect(res.code).toBe(500);
    expect(login).not.toHaveBeenCalled();
    if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });

  it('the default handler checks the signed-in user for real (no token → 401)', async () => {
    process.env.VITE_SUPABASE_URL = 'https://db.example.com';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await defaultHandler({ method: 'GET', headers: {} }, res);
    expect(res.code).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'Unauthorized' });
  });
});

describe('REQ-657: GET shows the breaker, never the session', () => {
  it('blocked: { blocked, reason, since } and nothing else', async () => {
    const res = await call('GET');
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ blocked: true, reason: 'it refused the login', since: '2026-10-22T00:05:00.000Z' });
    expect(JSON.stringify(res.body)).not.toContain('secret-cookie');
  });

  it('an empty table: blocked false', async () => {
    db = fakeSiteAccessDb(null);
    expect((await call('GET')).body).toEqual({ blocked: false, reason: null, since: null });
  });

  it('not blocked: blocked false', async () => {
    db = fakeSiteAccessDb({ ...BLOCKED, blocked_at: null, blocked_reason: null });
    expect((await call('GET')).body).toEqual({ blocked: false, reason: null, since: null });
  });

  it('a failed read → 500 with a plain message', async () => {
    db = fakeSiteAccessDb(null, { readError: 'timeout' });
    const res = await call('GET');
    expect(res.code).toBe(500);
    expect(res.body).toEqual({ ok: false, error: 'Could not read or update the booking-site status' });
  });
});

describe('REQ-657: POST is Clear', () => {
  it('clears it, records who, then logs in at once', async () => {
    const res = await call('POST');
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ ok: true, loggedIn: true });
    expect(db.state.row.blocked_at).toBeNull();
    expect(db.state.row.cleared_by).toBe('kate@example.com');
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith(db);
  });

  it('two presses clear and log in once; the second is 409', async () => {
    await call('POST');
    const second = await call('POST');
    expect(second.code).toBe(409);
    expect(second.body).toEqual({ ok: false, loggedIn: false, error: 'The booking site is not blocked' });
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('when not blocked, Clear does not log in', async () => {
    db = fakeSiteAccessDb({ ...BLOCKED, blocked_at: null, blocked_reason: null });
    expect((await call('POST')).code).toBe(409);
    expect(login).not.toHaveBeenCalled();
  });

  it('a refused login after Clear → 502 with the reason (the login re-tripped it and alerted)', async () => {
    login.mockResolvedValue({ ok: false, tripped: true, error: 'Authentication failed: Invalid credentials' });
    const res = await call('POST');
    expect(res.code).toBe(502);
    expect(res.body).toEqual({ ok: false, loggedIn: false, error: 'Authentication failed: Invalid credentials' });
  });

  it('a user with no email is recorded by id', async () => {
    verify.mockResolvedValue({ ok: true, user: { id: 'user-2', email: null } });
    await call('POST');
    expect(db.state.row.cleared_by).toBe('user-2');
  });
});
