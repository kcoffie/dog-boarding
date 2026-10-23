/**
 * /api/ops-watch handler: auth, dry run, cron_health, and the data it hands to the rules (REQ-651).
 * @requirements REQ-651, REQ-652, REQ-657, REQ-658, REQ-659, REQ-660
 *
 * Boundaries faked: Supabase (a chainable fake returning queued results per table), fetch
 * (GitHub + the roster image), Kate's alert channel (alertAndLog), and the cron_health writer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const results = {}; // table → array of { data, error, count } returned in call order
const calls = []; // [table, method, ...args]
function builder(table) {
  const b = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        const r = (results[table] ?? []).shift() ?? { data: [], error: null, count: 0 };
        return (res) => res(r);
      }
      return (...args) => { calls.push([table, prop, ...args]); return b; };
    },
  });
  return b;
}
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: (t) => builder(t) })) }));
vi.mock('../lib/alertKate.js', () => ({ alertAndLog: vi.fn(async () => true) }));
vi.mock('../../api/_cronHealth.js', () => ({ writeCronHealth: vi.fn(async () => {}) }));

const { createClient } = await import('@supabase/supabase-js');
const { alertAndLog } = await import('../lib/alertKate.js');
const { writeCronHealth } = await import('../../api/_cronHealth.js');
const { default: handler } = await import('../../api/ops-watch.js');

function call(headers = {}, query = {}) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ headers, query }, res).then(() => res);
}
const AUTH = { authorization: 'Bearer s3cret' };

// A healthy production: empty queue, today's roster delivered, all workflows fresh, image renders.
function healthy() {
  const now = Date.now();
  const ago = (h) => new Date(now - h * 3600e3).toISOString();
  results.sync_queue = [{ count: 0, error: null }, { data: [], error: null }, { data: [{ processed_at: ago(5) }], error: null }];
  results.cron_health = [
    { data: [{ last_ran_at: ago(16), status: 'success', result: { found: 227 }, error_msg: null }], error: null },
    { data: [
      { cron_name: 'notify-7am-claim', status: 'success', result: { date: '2026-10-16' } },
      { cron_name: 'notify-830am-claim', status: 'success', result: { date: '2026-10-16' } },
    ], error: null },
  ];
  results.message_log = [{ data: [{ wamid: 'w1', sent_at: ago(0.1) }], error: null }];
  results.message_delivery_status = [{ data: [{ wamid: 'w1' }], error: null }];
  results.site_access = [{ data: [{ blocked_at: null, blocked_reason: null }], error: null }];
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('roster-image')) return { status: 200, headers: { get: () => 'image/png' } };
    if (String(url).includes('/dispatches')) return { ok: true, status: 204 };
    return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ updated_at: ago(0.5) }] }) };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  process.env.CRON_SECRET = 's3cret';
  process.env.GH_ACTIONS_TOKEN = 'gh';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T17:00:00Z')); // a Friday, 10:00 PDT
  healthy();
});
afterEach(() => vi.useRealTimers());

describe('auth', () => {
  it('every request is rejected when CRON_SECRET is unset, even a dry run with a bearer token', async () => {
    delete process.env.CRON_SECRET;
    const res = await call({ authorization: 'Bearer undefined' }, { dryRun: '1' });
    expect(res.code).toBe(401);
  });

  it('a wrong bearer token is rejected before any database call', async () => {
    const res = await call({ authorization: 'Bearer nope' });
    expect(res.code).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('dry run', () => {
  it('returns the findings without alerting or writing cron_health', async () => {
    globalThis.fetch.mockImplementation(async (url) =>
      String(url).includes('roster-image')
        ? { status: 500, headers: { get: () => 'text/plain' } }
        : { ok: true, status: 200, json: async () => ({ workflow_runs: [{ updated_at: new Date().toISOString() }] }) });
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body).toEqual({ dryRun: true, findings: ['Roster image broken: HTTP 500 (text/plain)'] });
    expect(alertAndLog).not.toHaveBeenCalled();
    expect(writeCronHealth).not.toHaveBeenCalled();
    expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/dispatches'))).toBe(false);
  });
});

describe('cron_health', () => {
  it('a healthy run is recorded as success and sends nothing', async () => {
    await call(AUTH);
    expect(writeCronHealth).toHaveBeenCalledWith(expect.anything(), 'ops-watch', 'success', { findings: [] }, null);
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('a run whose findings were alerted on both channels is recorded as success', async () => {
    results.sync_queue = [{ count: 5, error: null }, { data: [{ queued_at: '2026-10-10T00:00:00Z' }], error: null },
      { data: [{ processed_at: '2026-10-16T16:00:00Z' }], error: null }];
    await call(AUTH);
    expect(alertAndLog).toHaveBeenCalledTimes(1);
    expect(writeCronHealth.mock.calls[0][2]).toBe('success');
  });

  it('a check that could not run is recorded as failure', async () => {
    delete process.env.GH_ACTIONS_TOKEN;
    await call(AUTH);
    expect(writeCronHealth.mock.calls[0][2]).toBe('failure');
    expect(writeCronHealth.mock.calls[0][3].findings).toEqual(["Couldn't check the scheduled workflows: GH_ACTIONS_TOKEN not set in Vercel"]);
  });

  it('a hung image request becomes a finding instead of hanging the function', async () => {
    globalThis.fetch.mockImplementation(async (url, init) => {
      if (String(url).includes('roster-image')) throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ updated_at: new Date().toISOString() }] }), init };
    });
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body.findings).toEqual(["Couldn't check the roster image: The operation was aborted due to timeout"]);
  });
});

describe('what the rules are given', () => {
  it('REQ-659: the window rule reads the 7am, 8:30am and Friday pm claim rows, keyed by name', async () => {
    results.cron_health[1] = { data: [{ cron_name: 'notify-7am-claim', status: 'success', result: { date: '2026-10-16' } }], error: null };
    const res = await call(AUTH, { dryRun: '1' });
    const ins = calls.filter(([t, m]) => t === 'cron_health' && m === 'in').map(([, , ...a]) => a);
    expect(ins).toEqual([['cron_name', ['notify-7am-claim', 'notify-830am-claim', 'notify-friday-pm-claim']]]);
    expect(res.body.findings).toEqual(["The 8:30am roster didn't run on 2026-10-16"]);
  });

  it('the schedule-scan rule reads the schedule row of cron_health, with status, result and error (#275)', async () => {
    await call(AUTH, { dryRun: '1' });
    const eqs = calls.filter(([t, m]) => t === 'cron_health' && m === 'eq').map(([, , ...a]) => a);
    expect(eqs).toEqual([['cron_name', 'schedule']]);
    const [cols] = calls.filter(([t, m]) => t === 'cron_health' && m === 'select').map(([, , c]) => c);
    expect(cols.split(',').map((c) => c.trim())).toEqual(expect.arrayContaining(['last_ran_at', 'status', 'result', 'error_msg']));
  });

  it('the roster query asks only for sent morning roster rows (4am, 7am, 8:30am), and null wamids are dropped', async () => {
    results.message_log = [{ data: [{ wamid: null, sent_at: new Date().toISOString() }], error: null }];
    const res = await call(AUTH, { dryRun: '1' });
    // The first message_log query is the roster's (the alert-log query runs after it).
    const logIns = calls.filter(([t, m]) => t === 'message_log' && m === 'in').map(([, , ...a]) => a);
    expect(logIns[0]).toEqual(['job_name', ['notify-4am', 'notify-7am', 'notify-8:30am']]);
    const logFilters = calls.filter(([t, m]) => t === 'message_log' && m === 'eq').map(([, , ...a]) => a);
    expect(logFilters[0]).toEqual(['status', 'sent']);
    expect(res.body.findings).toEqual(['Morning roster sent but not delivered to anyone (1 sends, no delivery receipt)']);
  });

  it("the roster query reads each row's recipient, so a Telegram send can count as delivered", async () => {
    results.message_log = [{ data: [{ wamid: null, sent_at: new Date().toISOString(), recipient: 'telegram' }], error: null }];
    const res = await call(AUTH, { dryRun: '1' });
    const selects = calls.filter(([t, m]) => t === 'message_log' && m === 'select').map(([, , cols]) => cols);
    expect(selects[0]).toBe('wamid, sent_at, recipient');
    expect(res.body.findings).toEqual([]);
  });

  it('only delivered or read webhook rows count as delivered', async () => {
    await call(AUTH, { dryRun: '1' });
    const inFilters = calls.filter(([t, m]) => t === 'message_delivery_status' && m === 'in').map(([, , ...a]) => a);
    expect(inFilters).toEqual([['wamid', ['w1']], ['status', ['delivered', 'read']]]);
  });

  it('workflow runs are read from scheduled runs only', async () => {
    await call(AUTH, { dryRun: '1' });
    const runUrls = globalThis.fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/runs?'));
    expect(runUrls).toHaveLength(5);
    expect(runUrls.every((u) => u.includes('status=success') && u.includes('event=schedule'))).toBe(true);
  });
});

describe('GitHub', () => {
  it('every GitHub call carries the token, the API version and a timeout', async () => {
    await call(AUTH, { dryRun: '1' });
    const gh = globalThis.fetch.mock.calls.filter(([u]) => String(u).startsWith('https://api.github.com/repos/kcoffie/dog-boarding/'));
    expect(gh).toHaveLength(5);
    for (const [, init] of gh) {
      expect(init.headers).toEqual({ Authorization: 'Bearer gh', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('a GitHub error for one workflow is reported for that workflow alone', async () => {
    const fresh = { ok: true, status: 200, json: async () => ({ workflow_runs: [{ updated_at: new Date().toISOString() }] }) };
    globalThis.fetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('roster-image')) return { status: 200, headers: { get: () => 'image/png' } };
      if (u.includes('gmail-monitor')) return { ok: false, status: 404 };
      if (u.includes('integration-check')) throw new Error('socket hang up');
      if (u.includes('keepalive')) return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
      return fresh;
    });
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body.findings).toEqual([
      "Couldn't check workflow gmail-monitor: HTTP 404",
      "Couldn't check workflow integration-check: socket hang up",
      'Workflow keepalive has never succeeded (disabled or failing?)',
    ]);
  });

  it('the email alert dispatches ops-alert.yml on main with the alert text', async () => {
    results.sync_queue = [{ count: 5, error: null }, { data: [{ queued_at: '2026-10-10T00:00:00Z' }], error: null },
      { data: [{ processed_at: '2026-10-16T16:00:00Z' }], error: null }];
    await call(AUTH);
    const [url, init] = globalThis.fetch.mock.calls.find(([u]) => String(u).includes('/dispatches'));
    expect(url).toBe('https://api.github.com/repos/kcoffie/dog-boarding/actions/workflows/ops-alert.yml/dispatches');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      ref: 'main',
      inputs: { findings: '⚠️ Q Boarding ops watch (2026-10-16)\n• Sync backlog: 5 items pending, oldest queued 161h ago' },
    });
  });

  it('a failed email dispatch makes the run a failure', async () => {
    results.sync_queue = [{ count: 5, error: null }, { data: [{ queued_at: '2026-10-10T00:00:00Z' }], error: null },
      { data: [{ processed_at: '2026-10-16T16:00:00Z' }], error: null }];
    const base = globalThis.fetch.getMockImplementation();
    globalThis.fetch.mockImplementation(async (url, init) => (String(url).includes('/dispatches') ? { ok: false, status: 403 } : base(url, init)));
    await call(AUTH);
    expect(writeCronHealth.mock.calls[0][2]).toBe('failure');
  });
});

describe("REQ-652: Kate's alert channel", () => {
  it('findings go to Kate through alertAndLog under the ops-watch job', async () => {
    results.sync_queue = [{ count: 5, error: null }, { data: [{ queued_at: '2026-10-10T00:00:00Z' }], error: null },
      { data: [{ processed_at: '2026-10-16T16:00:00Z' }], error: null }];
    await call(AUTH);
    expect(alertAndLog).toHaveBeenCalledWith(expect.anything(), 'ops-watch', expect.stringContaining('Sync backlog'));
  });

  it('an alert that was not delivered makes the run a failure', async () => {
    alertAndLog.mockResolvedValueOnce(false);
    results.sync_queue = [{ count: 5, error: null }, { data: [{ queued_at: '2026-10-10T00:00:00Z' }], error: null },
      { data: [{ processed_at: '2026-10-16T16:00:00Z' }], error: null }];
    await call(AUTH);
    expect(writeCronHealth.mock.calls[0][2]).toBe('failure');
  });

  it('REQ-657: the breaker is read from the one site_access row', async () => {
    await call(AUTH, { dryRun: '1' });
    const q = calls.filter(([t]) => t === 'site_access').map(([, m, ...a]) => [m, ...a]);
    expect(q).toEqual([['select', 'blocked_at, blocked_reason'], ['eq', 'id', true], ['limit', 1]]);
  });

  it('REQ-657: a tripped breaker in site_access becomes a finding', async () => {
    results.site_access = [{ data: [{ blocked_at: '2026-10-16T07:05:00Z', blocked_reason: 'it refused the login' }], error: null }];
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body.findings).toEqual([
      'Booking site blocked since 2026-10-16T07:05:00Z: it refused the login. Nothing syncs until Clear in Settings',
    ]);
  });

  it('failed alerts are read from message_log: status failed, the nine alert jobs, the last 24 hours', async () => {
    await call(AUTH, { dryRun: '1' });
    const q = calls.filter(([t]) => t === 'message_log').map(([, m, ...a]) => [m, ...a]);
    expect(q.slice(-4)).toEqual([
      ['select', 'job_name'], ['eq', 'status', 'failed'],
      ['in', 'job_name', ['cron-health-check', 'integration-check', 'gmail-monitor', 'send-question', 'notify-refresh-alert', 'site-access', 'notify-4am-alert', 'notify-alert', 'sync-detail']],
      ['gte', 'sent_at', '2026-10-15T17:00:00.000Z'],
    ]);
  });

  it('failed alert rows become a finding', async () => {
    results.message_log = [results.message_log[0], { data: [{ job_name: 'gmail-monitor' }], error: null }];
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body.findings).toEqual(['Alerts not delivered in the last 24h: 1 (gmail-monitor)']);
  });
});

describe('Supabase', () => {
  it('a sync_queue query error is reported as a check that could not run', async () => {
    results.sync_queue = [{ count: null, error: { message: 'relation does not exist' } }];
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body.findings).toEqual(["Couldn't check the sync queue: relation does not exist"]);
  });

  it('a later sync_queue query error is reported too', async () => {
    results.sync_queue = [{ count: 2, error: null }, { data: null, error: { message: 'timeout' } }];
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body.findings).toEqual(["Couldn't check the sync queue: timeout"]);
  });

  it('a message_log query error is reported as a roster check that could not run', async () => {
    results.message_log = [{ data: null, error: { message: 'permission denied' } }];
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body.findings).toEqual(["Couldn't check the morning roster: permission denied"]);
  });

  it('the queue is read as: pending count, oldest pending by queued_at, latest done by processed_at', async () => {
    await call(AUTH, { dryRun: '1' });
    const q = calls.filter(([t]) => t === 'sync_queue').map(([, m, ...a]) => [m, ...a]);
    expect(q).toEqual([
      ['select', 'id', { count: 'exact', head: true }], ['eq', 'status', 'pending'],
      ['select', 'queued_at'], ['eq', 'status', 'pending'], ['order', 'queued_at'], ['limit', 1],
      ['select', 'processed_at'], ['eq', 'status', 'done'], ['not', 'processed_at', 'is', null],
      ['order', 'processed_at', { ascending: false }], ['limit', 1],
    ]);
  });

  it('roster rows are read from the last 48 hours', async () => {
    await call(AUTH, { dryRun: '1' });
    const gte = calls.find(([t, m]) => t === 'message_log' && m === 'gte');
    expect(gte).toEqual(['message_log', 'gte', 'sent_at', '2026-10-14T17:00:00.000Z']);
  });
});

describe('roster image', () => {
  it('a response without a content type is reported as not a PNG', async () => {
    const base = globalThis.fetch.getMockImplementation();
    globalThis.fetch.mockImplementation(async (url, init) => (String(url).includes('roster-image')
      ? { status: 200, headers: { get: () => null } } : base(url, init)));
    const res = await call(AUTH, { dryRun: '1' });
    expect(res.body.findings).toEqual(['Roster image broken: HTTP 200 ()']);
  });

  it('the image is fetched from production with the proxy token, weekend type', async () => {
    process.env.INTERNAL_API_TOKEN = 'p&q';
    await call(AUTH, { dryRun: '1' });
    const [url, init] = globalThis.fetch.mock.calls.find(([u]) => String(u).includes('roster-image'));
    expect(url).toBe('https://qboarding.vercel.app/api/roster-image?type=weekend&token=p%26q');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
