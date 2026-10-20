/**
 * verifyUser: a browser caller must be a signed-in Supabase user, and the check fails closed.
 * Expected values come from REQ-656's acceptance criteria.
 * @requirements REQ-656
 *
 * Supabase's Auth API (GET /auth/v1/user) is the boundary: fetch is a fake that answers with its
 * documented shapes (200 + user object, 401 + error).
 */

import { describe, it, expect, vi } from 'vitest';
import { verifyUser, VERIFY_TIMEOUT_MS } from '../lib/verifyUser.js';

const ENV = { VITE_SUPABASE_URL: 'https://proj.supabase.example', VITE_SUPABASE_ANON_KEY: 'anon-key' };
const JWT = 'eyJ.user.jwt';
const USER = { id: 'user-1', email: 'staff@example.com', aud: 'authenticated' };

function answers(status, body) {
  return vi.fn(async () => ({ status, json: async () => body }));
}

describe('verifyUser', () => {
  it('a valid user token passes, with the user id and email from Supabase', async () => {
    const result = await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn: answers(200, USER) });
    expect(result).toEqual({ ok: true, user: { id: 'user-1', email: 'staff@example.com' } });
  });

  it("asks Supabase's /auth/v1/user with the anon key and the user's token, under a timeout", async () => {
    const fetchFn = answers(200, USER);
    await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://proj.supabase.example/auth/v1/user');
    expect(init.headers.apikey).toBe('anon-key');
    expect(init.headers.Authorization).toBe(`Bearer ${JWT}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(VERIFY_TIMEOUT_MS).toBe(5000);
  });

  it('missing Supabase URL is a 500, and nothing is fetched', async () => {
    const fetchFn = answers(200, USER);
    const result = await verifyUser(`Bearer ${JWT}`, { env: { VITE_SUPABASE_ANON_KEY: 'anon-key' }, fetchFn });
    expect(result).toEqual({ ok: false, status: 500, error: 'Server misconfigured' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('missing anon key is a 500, and nothing is fetched', async () => {
    const fetchFn = answers(200, USER);
    const result = await verifyUser(`Bearer ${JWT}`, { env: { VITE_SUPABASE_URL: ENV.VITE_SUPABASE_URL }, fetchFn });
    expect(result).toEqual({ ok: false, status: 500, error: 'Server misconfigured' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('no Authorization header is a 401, and nothing is fetched', async () => {
    const fetchFn = answers(200, USER);
    expect(await verifyUser(undefined, { env: ENV, fetchFn })).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a header that is not "Bearer <token>" is a 401', async () => {
    const fetchFn = answers(200, USER);
    expect((await verifyUser(JWT, { env: ENV, fetchFn })).status).toBe(401);
    expect((await verifyUser('Bearer ', { env: ENV, fetchFn })).status).toBe(401);
    expect((await verifyUser(`Basic Bearer ${JWT}`, { env: ENV, fetchFn })).status).toBe(401);
    expect((await verifyUser(`Bearer ${JWT} extra`, { env: ENV, fetchFn })).status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a token Supabase rejects (401) is a 401', async () => {
    const result = await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn: answers(401, { msg: 'invalid JWT' }) });
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('a 403 from Supabase is a 401', async () => {
    expect((await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn: answers(403, {}) })).status).toBe(401);
  });

  it('a non-200 answer is a 401 even if its body carries a user id', async () => {
    const result = await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn: answers(401, USER) });
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('a Supabase outage (5xx) is a 503, never a pass', async () => {
    const result = await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn: answers(500, {}) });
    expect(result).toEqual({ ok: false, status: 503, error: 'Sign-in check unavailable' });
  });

  it('a network error or timeout is a 503, never a pass', async () => {
    const fetchFn = vi.fn(async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); });
    expect(await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn })).toEqual({ ok: false, status: 503, error: 'Sign-in check unavailable' });
  });

  it('a 200 whose body is not JSON is a 503', async () => {
    const fetchFn = vi.fn(async () => ({ status: 200, json: async () => { throw new SyntaxError('bad json'); } }));
    expect(await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn })).toEqual({ ok: false, status: 503, error: 'Sign-in check unavailable' });
  });

  it('a 200 without a user id is a 401', async () => {
    expect(await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn: answers(200, {}) })).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('a 200 whose body is null is a 401', async () => {
    expect(await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn: answers(200, null) })).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('a user without an email passes with email null', async () => {
    const result = await verifyUser(`Bearer ${JWT}`, { env: ENV, fetchFn: answers(200, { id: 'user-2' }) });
    expect(result).toEqual({ ok: true, user: { id: 'user-2', email: null } });
  });
});
