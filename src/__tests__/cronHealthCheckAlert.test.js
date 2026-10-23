/**
 * cron-health-check main(): who gets the alert, and what an undelivered alert does to the run (REQ-652).
 * @requirements REQ-652, REQ-659
 *
 * Boundaries faked: Supabase (cron_health / cron_health_log rows) and alertAndLog (tested in alertKate.test.js).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let healthRows;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table) => {
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain,
        then: (resolve) => resolve(table === 'cron_health' ? { data: healthRows, error: null } : { data: [], error: null }),
      };
      return chain;
    },
  })),
}));
vi.mock('../lib/alertKate.js', () => ({ alertAndLog: vi.fn() }));

const { alertAndLog } = await import('../lib/alertKate.js');
const { main } = await import('../../scripts/cron-health-check.js');

const NOW = '2026-10-19T00:30:00.000Z';
const ranTonight = (cron_name) => ({ cron_name, last_ran_at: '2026-10-19T00:10:00.000Z', status: 'success' });
const opsWatchFresh = { cron_name: 'ops-watch', last_ran_at: '2026-10-18T17:20:00.000Z', status: 'success' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VITE_SUPABASE_URL = 'https://db.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  healthRows = [ranTonight('auth'), ranTonight('schedule'), ranTonight('detail'), opsWatchFresh];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('REQ-652: cron-health-check alerting', () => {
  it('all healthy: no alert, exit 0', async () => {
    expect(await main()).toBe(0);
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('a missed cron is alerted to Kate under the cron-health-check job, and a delivered alert exits 0', async () => {
    healthRows = [ranTonight('schedule'), ranTonight('detail'), opsWatchFresh]; // auth never ran
    alertAndLog.mockResolvedValue(true);
    expect(await main()).toBe(0);
    const [, job, text] = alertAndLog.mock.calls[0];
    expect(job).toBe('cron-health-check');
    expect(text).toMatch(/^⚠️ Cron health check \(10\/19\)\n• /);
    expect(text).toContain('cron-auth');
  });

  it('an alert that was not delivered exits 1, so the run goes red', async () => {
    healthRows = [ranTonight('schedule'), ranTonight('detail'), opsWatchFresh];
    alertAndLog.mockResolvedValue(false);
    expect(await main()).toBe(1);
  });
});

describe('REQ-659: the roster windows, checked from GitHub', () => {
  // Tue 00:30 UTC = Mon 17:30 PDT: Monday's 7am and 8:30am should have run.
  const MONDAY_EVENING = '2026-10-20T00:30:00.000Z';
  const ranMon = (cron_name) => ({ cron_name, last_ran_at: '2026-10-20T00:10:00.000Z', status: 'success' });
  const claim = (cron_name, status, date) => ({ cron_name, last_ran_at: '2026-10-19T14:20:00.000Z', status, result: { date } });

  beforeEach(() => {
    vi.setSystemTime(new Date(MONDAY_EVENING));
    healthRows = [ranMon('auth'), ranMon('schedule'), ranMon('detail'), { ...opsWatchFresh, last_ran_at: '2026-10-19T17:20:00.000Z' }];
  });

  it('both weekday windows finished today: no alert', async () => {
    healthRows.push(claim('notify-7am-claim', 'success', '2026-10-19'), claim('notify-830am-claim', 'success', '2026-10-19'));
    expect(await main()).toBe(0);
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('a window that never ran today is one line of the alert', async () => {
    healthRows.push(claim('notify-7am-claim', 'success', '2026-10-19'), claim('notify-830am-claim', 'success', '2026-10-16'));
    alertAndLog.mockResolvedValue(true);
    expect(await main()).toBe(0);
    expect(alertAndLog.mock.calls[0][2]).toBe("⚠️ Cron health check (10/20)\n• The 8:30am roster didn't run on 2026-10-19");
  });
});
