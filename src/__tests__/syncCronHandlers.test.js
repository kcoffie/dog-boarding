/**
 * The Vercel sync crons: cron-auth, cron-schedule, cron-detail (+ cron-detail-2).
 * @requirements REQ-109, REQ-401, REQ-640
 *
 * Expected values come from REQUIREMENTS, not from running the handlers.
 * These handlers are thin wrappers: auth gate, health tracking, result → HTTP status.
 * Boundaries faked: Supabase client creation, the AGYD login (authenticate), the session
 * store, the sync runner and queue (tested in scraper/), and the cron_health writer.
 *
 * Not covered on purpose: "runs when CRON_SECRET is unset". REQ-109 allows it, but #239
 * plans to make it fail closed, so a test would lock in the behavior about to change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ fake: 'supabase' })) }));
vi.mock('../lib/scraper/auth.js', () => ({ authenticate: vi.fn() }));
vi.mock('../lib/scraper/sessionCache.js', () => ({ storeSession: vi.fn(async () => {}) }));
vi.mock('../lib/scraper/syncRunner.js', () => ({ runScheduleSync: vi.fn(), runDetailSync: vi.fn() }));
vi.mock('../lib/scraper/syncQueue.js', () => ({ resetStuck: vi.fn(async () => 0) }));
vi.mock('../../api/_cronHealth.js', () => ({ writeCronHealth: vi.fn(async () => {}) }));

const { authenticate } = await import('../lib/scraper/auth.js');
const { storeSession } = await import('../lib/scraper/sessionCache.js');
const { runScheduleSync, runDetailSync } = await import('../lib/scraper/syncRunner.js');
const { resetStuck } = await import('../lib/scraper/syncQueue.js');
const { writeCronHealth } = await import('../../api/_cronHealth.js');
const { default: cronAuth } = await import('../../api/cron-auth.js');
const { default: cronSchedule } = await import('../../api/cron-schedule.js');
const { default: cronDetail } = await import('../../api/cron-detail.js');
const { default: cronDetail2 } = await import('../../api/cron-detail-2.js');

const SECRET = 'cron-secret';
const AUTH = { authorization: `Bearer ${SECRET}` };
const NOW = '2026-10-19T00:00:00.000Z';
const DAY_LATER = '2026-10-20T00:00:00.000Z';

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
  runScheduleSync.mockResolvedValue({ action: 'scanned', pagesScanned: 3, found: 12, skipped: 7, queued: 5, cursorAdvancedTo: '2026-11-02', queueDepth: 9 });
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

  it('falls back to the anon key when the service role key is unset', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const res = await call(handler);
    expect(res.code).toBe(200);
    expect(createClient).toHaveBeenCalledWith('https://db.example.com', 'anon-key');
  });
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

  it('stores the new session cookies for 24 hours', async () => {
    await call(cronAuth);
    expect(storeSession).toHaveBeenCalledWith({ fake: 'supabase' }, 'sid=abc', 24 * 60 * 60 * 1000);
  });

  it('answers refreshed with the expiry 24 hours from now', async () => {
    const res = await call(cronAuth);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ ok: true, action: 'refreshed', expiresAt: DAY_LATER });
  });

  it('records started, then success with the expiry', async () => {
    await call(cronAuth);
    expect(writes('auth')).toStrictEqual([
      ['started', { action: 'running' }, null],
      ['success', { action: 'refreshed', expiresAt: DAY_LATER }, null],
    ]);
  });

  it('a rejected login fails the run, records the reason and stores no session', async () => {
    authenticate.mockResolvedValue({ success: false, error: 'bad password' });
    const res = await call(cronAuth);
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Authentication failed: bad password' });
    expect(storeSession).not.toHaveBeenCalled();
    expect(writes('auth').at(-1)).toEqual(['failure', null, 'Authentication failed: bad password']);
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

  it('records the scan stats on success', async () => {
    const res = await call(cronSchedule);
    expect(res.code).toBe(200);
    expect(writes('schedule').at(-1)).toStrictEqual(['success', {
      pagesScanned: 3, found: 12, skipped: 7, queued: 5, cursorAdvancedTo: '2026-11-02', queueDepth: 9,
    }, null]);
  });

  it('returns the scan result to the caller', async () => {
    const res = await call(cronSchedule);
    expect(res.body).toStrictEqual({ ok: true, action: 'scanned', pagesScanned: 3, found: 12, skipped: 7, queued: 5, cursorAdvancedTo: '2026-11-02', queueDepth: 9 });
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

  it('cron-detail-2 is a second run of the same detail processor', async () => {
    const res = await call(cronDetail2);
    expect(res.code).toBe(200);
    expect(runDetailSync).toHaveBeenCalledTimes(1);
    expect(writes('detail').at(-1)[0]).toBe('success');
  });
});
