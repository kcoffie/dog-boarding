/**
 * The Vercel sync crons: cron-auth, cron-schedule, cron-detail (+ cron-detail-2).
 * @requirements REQ-109, REQ-401, REQ-640, REQ-657
 *
 * Expected values come from REQUIREMENTS, not from running the handlers.
 * These handlers are thin wrappers: auth gate, health tracking, result → HTTP status.
 * Boundaries faked: Supabase client creation, the AGYD login (authenticate), the site_access
 * table (session store and breaker; siteAccess.test.js covers it), the sync runner and queue (tested in scraper/), and the cron_health writer.
 *
 * Not covered on purpose: "runs when CRON_SECRET is unset". REQ-109 allows it, but #239
 * plans to make it fail closed, so a test would lock in the behavior about to change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ fake: 'supabase' })) }));
vi.mock('../lib/scraper/auth.js', () => ({ authenticate: vi.fn() }));
vi.mock('../lib/scraper/siteAccess.js', async (importOriginal) => ({
  throttleReason: (await importOriginal()).throttleReason,
  readSiteAccess: vi.fn(),
  storeSiteSession: vi.fn(),
  tripBreaker: vi.fn(async () => true),
}));
vi.mock('../lib/scraper/syncRunner.js', () => ({ runScheduleSync: vi.fn(), runDetailSync: vi.fn(), alertDetailNotices: vi.fn(async () => null) }));
vi.mock('../lib/scraper/syncQueue.js', () => ({ resetStuck: vi.fn(async () => 0) }));
vi.mock('../../api/_cronHealth.js', () => ({ writeCronHealth: vi.fn(async () => {}) }));

const { authenticate } = await import('../lib/scraper/auth.js');
const { readSiteAccess, storeSiteSession, tripBreaker } = await import('../lib/scraper/siteAccess.js');
const { runScheduleSync, runDetailSync, alertDetailNotices } = await import('../lib/scraper/syncRunner.js');
const { resetStuck } = await import('../lib/scraper/syncQueue.js');
const { writeCronHealth } = await import('../../api/_cronHealth.js');
const { default: cronAuth } = await import('../../api/cron-auth.js');
const { default: cronSchedule } = await import('../../api/cron-schedule.js');
const { default: cronDetail } = await import('../../api/cron-detail.js');
const { default: cronDetail2 } = await import('../../api/cron-detail-2.js');

const SECRET = 'cron-secret';
const AUTH = { authorization: `Bearer ${SECRET}` };
const NOW = '2026-10-19T00:00:00.000Z';
const STAMP = '2026-10-20T06:00:00.000Z'; // what storeSiteSession stamped (30 h; siteAccess.test.js)

function call(handler, { method = 'GET', headers = AUTH } = {}) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return Promise.resolve(handler({ method, headers, query: {} }, res)).then(() => res);
}

/** [status, result, errorMsg] of every cron_health write for one cron, in order. */
const writes = (name) => writeCronHealth.mock.calls.filter(c => c[1] === name).map(c => [c[2], c[3], c[4]]);
const modules = { 'cron-auth': '../../api/cron-auth.js', 'cron-schedule': '../../api/cron-schedule.js', 'cron-detail': '../../api/cron-detail.js', 'cron-detail-2': '../../api/cron-detail-2.js' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  process.env.VITE_SUPABASE_URL = 'https://db.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.EXTERNAL_SITE_USERNAME = 'user';
  process.env.EXTERNAL_SITE_PASSWORD = 'pass';
  writeCronHealth.mockImplementation(async () => {});
  resetStuck.mockImplementation(async () => 0);
  authenticate.mockResolvedValue({ success: true, cookies: 'sid=abc' });
  readSiteAccess.mockResolvedValue({ session_cookies: null, session_expires_at: null, blocked_at: null, blocked_reason: null });
  storeSiteSession.mockResolvedValue(STAMP);
  tripBreaker.mockResolvedValue(true);
  runScheduleSync.mockResolvedValue({ action: 'scanned', pagesScanned: 3, found: 12, skipped: 7, queued: 5, requeuedEdited: 2, urlChangesIgnored: 4, cursorAdvancedTo: '2026-11-02', queueDepth: 9 });
  runDetailSync.mockResolvedValue({ action: 'created', externalId: 'EXT1', queueDepth: 4 });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// Shared gate (REQ-109): every cron checks CRON_SECRET when it is set
// ---------------------------------------------------------------------------

describe.each([
  ['cron-auth', cronAuth, () => authenticate],
  ['cron-schedule', cronSchedule, () => runScheduleSync],
  ['cron-detail', cronDetail, () => runDetailSync],
])('REQ-109: %s request gate', (_name, handler, work) => {
  it('a wrong bearer token is rejected before any work', async () => {
    const res = await call(handler, { headers: { authorization: 'Bearer nope' } });
    expect(res.code).toBe(401);
    expect(res.body).toStrictEqual({ error: 'Unauthorized' });
    expect(work()).not.toHaveBeenCalled();
    expect(writeCronHealth).not.toHaveBeenCalled();
  });

  it('a request with no authorization header is rejected', async () => {
    const res = await call(handler, { headers: {} });
    expect(res.code).toBe(401);
    expect(work()).not.toHaveBeenCalled();
  });

  it('only GET is accepted', async () => {
    const res = await call(handler, { method: 'POST' });
    expect(res.code).toBe(405);
    expect(res.body).toStrictEqual({ error: 'Method not allowed' });
    expect(work()).not.toHaveBeenCalled();
  });

  it('missing Supabase settings fail the run with 500', async () => {
    delete process.env.VITE_SUPABASE_URL;
    const res = await call(handler);
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Supabase env vars not configured' });
    expect(work()).not.toHaveBeenCalled();
  });

  it.skipIf(_name === 'cron-auth')('falls back to the anon key when the service role key is unset', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const res = await call(handler);
    expect(res.code).toBe(200);
    expect(createClient).toHaveBeenCalledWith('https://db.example.com', 'anon-key');
  });
});

it('REQ-657: cron-auth uses the service key only: without it the run fails and nothing logs in', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  const res = await call(cronAuth);
  expect(res.code).toBe(500);
  expect(res.body).toStrictEqual({ error: 'Supabase env vars not configured' });
  expect(authenticate).not.toHaveBeenCalled();
});

describe('REQ-109: the crons run on the Node.js runtime (process.env), not edge', () => {
  it.each(Object.entries(modules))('%s', async (_name, path) => {
    const { config } = await import(path);
    expect(config).toStrictEqual({ runtime: 'nodejs' });
  });
});

// ---------------------------------------------------------------------------
// cron-auth (REQ-109, REQ-640)
// ---------------------------------------------------------------------------

describe('REQ-640: cron-auth', () => {
  it('logs in on every run, with the configured site credentials', async () => {
    await call(cronAuth);
    await call(cronAuth);
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(authenticate).toHaveBeenCalledWith('user', 'pass');
  });

  it('stores the new session in site_access', async () => {
    await call(cronAuth);
    expect(storeSiteSession).toHaveBeenCalledWith({ fake: 'supabase' }, 'sid=abc');
  });

  it('answers refreshed with the stored session\'s expiry', async () => {
    const res = await call(cronAuth);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ ok: true, action: 'refreshed', expiresAt: STAMP });
  });

  it('records started, then success with the expiry', async () => {
    await call(cronAuth);
    expect(writes('auth')).toStrictEqual([
      ['started', { action: 'running' }, null],
      ['success', { action: 'refreshed', expiresAt: STAMP }, null],
    ]);
  });

  it('a rejected login fails the run, records the reason, stores no session and trips the breaker (REQ-657)', async () => {
    authenticate.mockResolvedValue({ success: false, error: 'Invalid credentials', rejected: true });
    const res = await call(cronAuth);
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Authentication failed: Invalid credentials' });
    expect(storeSiteSession).not.toHaveBeenCalled();
    expect(tripBreaker).toHaveBeenCalledWith({ fake: 'supabase' }, 'it refused the login', { rejectedLogin: true });
    expect(writes('auth').at(-1)).toEqual(['failure', null, 'Authentication failed: Invalid credentials']);
  });

  it('a 429 on the login trips the breaker naming the status (REQ-657)', async () => {
    authenticate.mockResolvedValue({ success: false, error: 'Login answered 429', throttled: true, status: 429 });
    await call(cronAuth);
    expect(tripBreaker).toHaveBeenCalledWith({ fake: 'supabase' }, 'it answered 429 (too many requests) on the login page');
  });

  it('a login that fails with a 5xx fails the run without tripping the breaker (REQ-657)', async () => {
    authenticate.mockResolvedValue({ success: false, error: 'Login failed with status 502' });
    const res = await call(cronAuth);
    expect(res.code).toBe(500);
    expect(tripBreaker).not.toHaveBeenCalled();
  });

  it('while the breaker is tripped, it does not log in and records site_blocked as success (REQ-657)', async () => {
    readSiteAccess.mockResolvedValue({ blocked_at: '2026-10-18T07:05:00.000Z', blocked_reason: 'it refused the login' });
    const res = await call(cronAuth);
    expect(res.code).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, action: 'site_blocked' });
    expect(authenticate).not.toHaveBeenCalled();
    expect(writes('auth').at(-1)).toStrictEqual(['success', { action: 'site_blocked' }, null]);
  });

  it('a failed site_access read fails the run without logging in (fails closed)', async () => {
    readSiteAccess.mockRejectedValue(new Error('site_access read failed: timeout'));
    const res = await call(cronAuth);
    expect(res.code).toBe(500);
    expect(authenticate).not.toHaveBeenCalled();
    expect(writes('auth').at(-1)).toStrictEqual(['failure', null, 'site_access read failed: timeout']);
  });

  it('missing site credentials fail the run without trying to log in', async () => {
    delete process.env.EXTERNAL_SITE_PASSWORD;
    const res = await call(cronAuth);
    expect(res.code).toBe(500);
    expect(res.body.error).toMatch(/EXTERNAL_SITE_PASSWORD/);
    expect(authenticate).not.toHaveBeenCalled();
    expect(writes('auth').at(-1)[0]).toBe('failure');
  });

  it('a missing username also fails the run without trying to log in', async () => {
    delete process.env.EXTERNAL_SITE_USERNAME;
    const res = await call(cronAuth);
    expect(res.code).toBe(500);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('the recorded failure message is cut to 500 characters', async () => {
    authenticate.mockRejectedValue(new Error('x'.repeat(600)));
    await call(cronAuth);
    expect(writes('auth').at(-1)[2]).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------
// cron-schedule (REQ-109, REQ-401)
// ---------------------------------------------------------------------------

describe('REQ-109: cron-schedule', () => {
  it('records schedule started first', async () => {
    await call(cronSchedule);
    expect(writes('schedule')[0]).toStrictEqual(['started', { action: 'running' }, null]);
  });

  it('records started before scanning', async () => {
    const order = [];
    writeCronHealth.mockImplementation(async (_s, _n, status) => { order.push(status); });
    runScheduleSync.mockImplementation(async () => { order.push('scan'); return { action: 'scanned' }; });
    await call(cronSchedule);
    expect(order.slice(0, 2)).toEqual(['started', 'scan']);
  });

  it('a scan whose enqueues failed is recorded as failure, keeping its counts (#275)', async () => {
    runScheduleSync.mockResolvedValue({
      action: 'enqueue_failed', failedEnqueues: 2, failedEnqueueIds: ['A', 'B'],
      pagesScanned: 3, found: 12, skipped: 7, queued: 3, requeuedEdited: 0, urlChangesIgnored: 1, cursorAdvancedTo: '2026-11-02', queueDepth: 9,
    });
    await call(cronSchedule);
    expect(writes('schedule').at(-1)).toStrictEqual(['failure', {
      action: 'enqueue_failed', failedEnqueues: 2, failedEnqueueIds: ['A', 'B'],
      pagesScanned: 3, found: 12, skipped: 7, queued: 3, requeuedEdited: 0, urlChangesIgnored: 1, cursorAdvancedTo: '2026-11-02', queueDepth: 9,
    }, '2 enqueue(s) failed']);
  });

  it('records the scan stats on success', async () => {
    const res = await call(cronSchedule);
    expect(res.code).toBe(200);
    expect(writes('schedule').at(-1)).toStrictEqual(['success', {
      pagesScanned: 3, found: 12, skipped: 7, queued: 5, requeuedEdited: 2, urlChangesIgnored: 4, cursorAdvancedTo: '2026-11-02', queueDepth: 9,
    }, null]);
  });

  // Removed bookings (#316, REQ-108)
  const REC = { mode: 'live', candidates: 2, present: ['BKLIVE01'], gone: [{ external_id: 'BKGONE01' }], archived: 1, restores: [], skipped: null, errors: 0, alertDelivered: true };
  const STATS = { pagesScanned: 3, found: 12, skipped: 7, queued: 5, requeuedEdited: 2, urlChangesIgnored: 4, cursorAdvancedTo: '2026-11-02', queueDepth: 9 };

  it('only this nightly run asks the scan to reconcile removed bookings', async () => {
    await call(cronSchedule);
    expect(runScheduleSync.mock.calls[0][1]).toStrictEqual({ reconcile: true });
  });

  it("records the removed-bookings counts with the scan's", async () => {
    runScheduleSync.mockResolvedValue({ action: 'scanned', ...STATS, reconcile: REC });
    await call(cronSchedule);
    expect(writes('schedule').at(-1)).toStrictEqual(['success', {
      ...STATS,
      reconcile: { mode: 'live', candidates: 2, present: 1, gone: 1, archived: 1, restores: 0, skipped: null, errors: 0, alertDelivered: true },
    }, null]);
  });

  it('a removed-bookings alert that was not delivered makes the run a failure (REQ-652)', async () => {
    runScheduleSync.mockResolvedValue({ action: 'scanned', ...STATS, reconcile: { ...REC, alertDelivered: false } });
    await call(cronSchedule);
    const [status, result, error] = writes('schedule').at(-1);
    expect([status, result.reconcile.alertDelivered, error]).toStrictEqual(['failure', false, 'the removed-bookings alert was not delivered']);
  });

  it('a quiet night (no alert to send) is a success', async () => {
    runScheduleSync.mockResolvedValue({ action: 'scanned', ...STATS, reconcile: { ...REC, gone: [], present: [], archived: 0, alertDelivered: null } });
    await call(cronSchedule);
    expect(writes('schedule').at(-1)[0]).toBe('success');
  });

  it('failed enqueues and an undelivered alert are both named', async () => {
    runScheduleSync.mockResolvedValue({ action: 'enqueue_failed', failedEnqueues: 1, failedEnqueueIds: ['A'], ...STATS, reconcile: { ...REC, alertDelivered: false } });
    await call(cronSchedule);
    expect(writes('schedule').at(-1)[2]).toBe('1 enqueue(s) failed; the removed-bookings alert was not delivered');
  });

  it('returns the scan result to the caller', async () => {
    const res = await call(cronSchedule);
    expect(res.body).toStrictEqual({ ok: true, action: 'scanned', pagesScanned: 3, found: 12, skipped: 7, queued: 5, requeuedEdited: 2, urlChangesIgnored: 4, cursorAdvancedTo: '2026-11-02', queueDepth: 9 });
  });

  it('a failed session is recorded as a failure with its reason, without failing the HTTP call', async () => {
    runScheduleSync.mockResolvedValue({ action: 'session_failed', error: 'login refused' });
    const res = await call(cronSchedule);
    expect(res.code).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, action: 'session_failed', error: 'login refused' });
    expect(writes('schedule').at(-1)).toStrictEqual(['failure', { action: 'session_failed' }, 'login refused']);
  });

  it('a failed session with no reason is still recorded as a failure', async () => {
    runScheduleSync.mockResolvedValue({ action: 'session_failed' });
    const res = await call(cronSchedule);
    expect(res.code).toBe(200);
    expect(writes('schedule').at(-1)).toStrictEqual(['failure', { action: 'session_failed' }, undefined]);
  });

  it('a session failure reason is cut to 500 characters', async () => {
    runScheduleSync.mockResolvedValue({ action: 'session_failed', error: 'e'.repeat(700) });
    await call(cronSchedule);
    expect(writes('schedule').at(-1)[2]).toHaveLength(500);
  });

  it('a cleared session (server rejected the cookies) is recorded as success with the reason', async () => {
    runScheduleSync.mockResolvedValue({ action: 'session_cleared', reason: 'cookies rejected' });
    const res = await call(cronSchedule);
    expect(res.code).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, action: 'session_cleared', reason: 'cookies rejected' });
    expect(writes('schedule').at(-1)).toStrictEqual(['success', { action: 'session_cleared', reason: 'cookies rejected' }, null]);
  });

  it('REQ-657: a blocked run is recorded as success with site_blocked (the breaker already alerted)', async () => {
    runScheduleSync.mockResolvedValue({ action: 'site_blocked', pagesScanned: 0 });
    const res = await call(cronSchedule);
    expect(res.code).toBe(200);
    expect(writes('schedule').at(-1)).toStrictEqual(['success', { action: 'site_blocked' }, null]);
  });

  it('an unexpected error returns 500 and records the failure', async () => {
    runScheduleSync.mockRejectedValue(new Error('parse crash'));
    const res = await call(cronSchedule);
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'parse crash' });
    expect(writes('schedule').at(-1)).toStrictEqual(['failure', null, 'parse crash']);
  });

  it('the recorded failure message is cut to 500 characters', async () => {
    runScheduleSync.mockRejectedValue(new Error('p'.repeat(600)));
    await call(cronSchedule);
    expect(writes('schedule').at(-1)[2]).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------
// cron-detail and cron-detail-2 (REQ-109, REQ-401)
// ---------------------------------------------------------------------------

describe('REQ-109: cron-detail', () => {
  it('resets stuck items before processing the queue', async () => {
    const order = [];
    resetStuck.mockImplementation(async () => { order.push('reset'); return 2; });
    runDetailSync.mockImplementation(async () => { order.push('detail'); return { action: 'created' }; });
    await call(cronDetail);
    expect(order).toEqual(['reset', 'detail']);
  });

  it('records detail started first', async () => {
    await call(cronDetail);
    expect(writes('detail')[0]).toStrictEqual(['started', { action: 'running' }, null]);
  });

  it('records started before processing', async () => {
    const order = [];
    writeCronHealth.mockImplementation(async (_s, _n, status) => { order.push(status); });
    resetStuck.mockImplementation(async () => { order.push('reset'); return 0; });
    await call(cronDetail);
    expect(order.slice(0, 2)).toEqual(['started', 'reset']);
  });

  it('records what it did, which item and the queue depth on success', async () => {
    const res = await call(cronDetail);
    expect(res.code).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, action: 'created', externalId: 'EXT1', queueDepth: 4 });
    expect(writes('detail').at(-1)).toStrictEqual(['success', { action: 'created', externalId: 'EXT1', queueDepth: 4 }, null]);
  });

  it('REQ-660: a booking page it could not read is alerted with that run\'s notice and recorded as a successful run', async () => {
    runDetailSync.mockResolvedValue({ action: 'redirected_to_schedule', externalId: 'EXT1', queueDepth: 4, notice: 'EXT1 "Dog A 10/24-27": its page now redirects' });
    const res = await call(cronDetail);
    expect(res.code).toBe(200);
    expect(alertDetailNotices).toHaveBeenCalledTimes(1);
    expect(alertDetailNotices.mock.calls[0][1]).toStrictEqual(['EXT1 "Dog A 10/24-27": its page now redirects']);
    expect(writes('detail').at(-1)).toStrictEqual(['success', { action: 'redirected_to_schedule', externalId: 'EXT1', queueDepth: 4 }, null]);
  });

  it('a failed session is recorded as a failure with its reason, without failing the HTTP call', async () => {
    runDetailSync.mockResolvedValue({ action: 'session_failed', error: 'login refused' });
    const res = await call(cronDetail);
    expect(res.code).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, action: 'session_failed', error: 'login refused' });
    expect(writes('detail').at(-1)).toStrictEqual(['failure', { action: 'session_failed' }, 'login refused']);
  });

  it('a failed session with no reason is still recorded as a failure', async () => {
    runDetailSync.mockResolvedValue({ action: 'session_failed' });
    const res = await call(cronDetail);
    expect(res.code).toBe(200);
    expect(writes('detail').at(-1)).toStrictEqual(['failure', { action: 'session_failed' }, undefined]);
  });

  it('a session failure reason is cut to 500 characters', async () => {
    runDetailSync.mockResolvedValue({ action: 'session_failed', error: 'e'.repeat(700) });
    await call(cronDetail);
    expect(writes('detail').at(-1)[2]).toHaveLength(500);
  });

  it('REQ-657: a blocked run is recorded as success with site_blocked (the breaker already alerted)', async () => {
    runDetailSync.mockResolvedValue({ action: 'site_blocked' });
    const res = await call(cronDetail);
    expect(res.code).toBe(200);
    expect(writes('detail').at(-1)).toStrictEqual(['success', { action: 'site_blocked' }, null]);
  });

  it('a cleared session is recorded as success', async () => {
    runDetailSync.mockResolvedValue({ action: 'session_cleared' });
    const res = await call(cronDetail);
    expect(res.code).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, action: 'session_cleared' });
    expect(writes('detail').at(-1)).toStrictEqual(['success', { action: 'session_cleared' }, null]);
  });

  it('an unexpected error returns 500 and records the failure', async () => {
    runDetailSync.mockRejectedValue(new Error('upsert failed'));
    const res = await call(cronDetail);
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'upsert failed' });
    expect(writes('detail').at(-1)).toStrictEqual(['failure', null, 'upsert failed']);
  });

  it('the recorded failure message is cut to 500 characters', async () => {
    runDetailSync.mockRejectedValue(new Error('u'.repeat(600)));
    await call(cronDetail);
    expect(writes('detail').at(-1)[2]).toHaveLength(500);
  });

  it('cron-detail does not ask the runner to reset stuck items a second time', async () => {
    await call(cronDetail);
    expect(runDetailSync).toHaveBeenCalledWith({ fake: 'supabase' }, { runResetStuck: false });
  });

  it('cron-detail-2 is the same handler as cron-detail (same gate, same health writes)', () => {
    expect(cronDetail2).toBe(cronDetail);
  });

  it('cron-detail-2 is a second run of the same detail processor', async () => {
    const res = await call(cronDetail2);
    expect(res.code).toBe(200);
    expect(runDetailSync).toHaveBeenCalledTimes(1);
    expect(writes('detail').at(-1)[0]).toBe('success');
  });
});
