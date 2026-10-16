/**
 * Ops watch: outcome checks that run outside GitHub. Expected values come from REQ-651.
 * @requirements REQ-651
 *
 * Boundaries (Supabase, GitHub, the image endpoint, WhatsApp) are fakes passed to runOpsWatch.
 */

import { describe, it, expect } from 'vitest';
import {
  checkQueue,
  checkRoster,
  checkWorkflowRuns,
  checkImage,
  runOpsWatch,
  WORKFLOW_MAX_AGE_HOURS,
} from '../lib/opsWatch.js';

// Friday 2026-10-16 17:00 UTC = 10:00 PDT, when the cron runs.
const NOW = new Date('2026-10-16T17:00:00Z');
const hoursAgo = (h, now = NOW) => new Date(now.getTime() - h * 3600e3).toISOString();

describe('queue backlog and sync progress', () => {
  it('an oldest pending item queued more than 48 h ago is a backlog finding', () => {
    const f = checkQueue({ pendingCount: 3, oldestPendingAt: hoursAgo(49), lastDoneAt: hoursAgo(1) }, NOW);
    expect(f).toEqual(['Sync backlog: 3 items pending, oldest queued 49h ago']);
  });

  it('an oldest pending item queued exactly 48 h ago is not yet a backlog finding', () => {
    expect(checkQueue({ pendingCount: 3, oldestPendingAt: hoursAgo(48), lastDoneAt: hoursAgo(1) }, NOW)).toEqual([]);
  });

  it('pending items with nothing done in the last 36 h is a stalled-sync finding', () => {
    const f = checkQueue({ pendingCount: 3, oldestPendingAt: hoursAgo(2), lastDoneAt: hoursAgo(37) }, NOW);
    expect(f).toEqual(['Sync stalled: 3 items pending and none processed in 36h']);
  });

  it('pending items with something done exactly 36 h ago is not stalled', () => {
    expect(checkQueue({ pendingCount: 3, oldestPendingAt: hoursAgo(2), lastDoneAt: hoursAgo(36) }, NOW)).toEqual([]);
  });

  it('pending items that were never processed at all count as stalled', () => {
    const f = checkQueue({ pendingCount: 1, oldestPendingAt: hoursAgo(2), lastDoneAt: null }, NOW);
    expect(f).toEqual(['Sync stalled: 1 items pending and none processed in 36h']);
  });

  it('an empty queue is never a finding, however old the last done item', () => {
    expect(checkQueue({ pendingCount: 0, oldestPendingAt: null, lastDoneAt: hoursAgo(500) }, NOW)).toEqual([]);
  });

  it('the backlog finding names the pending count', () => {
    const f = checkQueue({ pendingCount: 880, oldestPendingAt: hoursAgo(100), lastDoneAt: hoursAgo(1) }, NOW);
    expect(f[0]).toContain('880');
  });
});

describe('morning roster', () => {
  const sentToday = { wamid: 'w1', sent_at: '2026-10-16T11:00:05Z' }; // 04:00 PDT today

  it('a roster sent today and delivered is not a finding', () => {
    expect(checkRoster({ sent: [sentToday], deliveredWamids: ['w1'] }, NOW)).toEqual([]);
  });

  it('no roster sent today on a weekday is a finding', () => {
    expect(checkRoster({ sent: [], deliveredWamids: [] }, NOW)).toEqual(['No morning roster sent today (2026-10-16)']);
  });

  it('a roster sent but never delivered is a different finding', () => {
    expect(checkRoster({ sent: [sentToday], deliveredWamids: [] }, NOW))
      .toEqual(['Morning roster sent but not delivered to anyone (1 sends, no delivery receipt)']);
  });

  it('one delivered wamid out of two recipients is enough', () => {
    const sent = [sentToday, { wamid: 'w2', sent_at: '2026-10-16T11:00:05Z' }];
    expect(checkRoster({ sent, deliveredWamids: ['w2'] }, NOW)).toEqual([]);
  });

  it("yesterday's roster doesn't count for today (Pacific date)", () => {
    // 2026-10-16T06:00Z is 23:00 PDT on Oct 15.
    const f = checkRoster({ sent: [{ wamid: 'w0', sent_at: '2026-10-16T06:00:00Z' }], deliveredWamids: ['w0'] }, NOW);
    expect(f[0]).toMatch(/no morning roster/i);
  });

  it('a roster sent just after Pacific midnight counts for today', () => {
    // 2026-10-16T07:30Z is 00:30 PDT on Oct 16.
    const f = checkRoster({ sent: [{ wamid: 'w3', sent_at: '2026-10-16T07:30:00Z' }], deliveredWamids: ['w3'] }, NOW);
    expect(f).toEqual([]);
  });

  it('Saturday (Pacific) is never checked', () => {
    expect(checkRoster({ sent: [], deliveredWamids: [] }, new Date('2026-10-17T17:00:00Z'))).toEqual([]);
  });

  it('Sunday (Pacific) is never checked', () => {
    expect(checkRoster({ sent: [], deliveredWamids: [] }, new Date('2026-10-18T17:00:00Z'))).toEqual([]);
  });

  it('Monday 01:00 UTC is still Sunday in Pacific, so not checked', () => {
    expect(checkRoster({ sent: [], deliveredWamids: [] }, new Date('2026-10-19T01:00:00Z'))).toEqual([]);
  });

  it('after DST ends, Pacific midnight is 08:00 UTC (a 07:30 UTC send is the day before)', () => {
    // Tuesday 2026-11-03: PST (UTC-8). 07:30Z is 23:30 PST on Nov 2.
    const now = new Date('2026-11-03T17:00:00Z');
    const f = checkRoster({ sent: [{ wamid: 'w4', sent_at: '2026-11-03T07:30:00Z' }], deliveredWamids: ['w4'] }, now);
    expect(f[0]).toMatch(/no morning roster/i);
  });
});

describe('scheduled workflows', () => {
  const healthy = () => ({
    'gmail-monitor.yml': hoursAgo(1),
    'integration-check.yml': hoursAgo(9),
    'cron-health-check.yml': hoursAgo(17),
    'notify-4am.yml': hoursAgo(6),
    'keepalive.yml': hoursAgo(24 * 4),
  });

  it('the age limits are the ones in REQ-651', () => {
    expect(WORKFLOW_MAX_AGE_HOURS).toEqual({
      'gmail-monitor.yml': 3,
      'integration-check.yml': 12,
      'cron-health-check.yml': 26,
      'notify-4am.yml': 96,
      'keepalive.yml': 192,
    });
  });

  it('every workflow inside its limit is not a finding', () => {
    expect(checkWorkflowRuns(healthy(), NOW)).toEqual([]);
  });

  it('a workflow past its limit is a finding that names it', () => {
    const runs = { ...healthy(), 'gmail-monitor.yml': hoursAgo(4) };
    expect(checkWorkflowRuns(runs, NOW)).toEqual(['Workflow gmail-monitor: last success 4h ago (limit 3h)']);
  });

  it('a workflow exactly at its limit is not yet a finding', () => {
    const runs = { ...healthy(), 'integration-check.yml': hoursAgo(12) };
    expect(checkWorkflowRuns(runs, NOW)).toEqual([]);
  });

  it('a workflow that never succeeded is a finding', () => {
    const runs = { ...healthy(), 'keepalive.yml': null };
    expect(checkWorkflowRuns(runs, NOW)).toEqual(['Workflow keepalive has never succeeded (disabled or failing?)']);
  });

  it("a workflow GitHub couldn't be asked about is named, and the others are still checked", () => {
    const runs = { ...healthy(), 'gmail-monitor.yml': { error: 'HTTP 404' }, 'keepalive.yml': null };
    expect(checkWorkflowRuns(runs, NOW)).toEqual([
      "Couldn't check workflow gmail-monitor: HTTP 404",
      'Workflow keepalive has never succeeded (disabled or failing?)',
    ]);
  });

  it('the weekend gap before Monday 4am (about 3 days) is inside the 4-day limit', () => {
    const monday0600 = new Date('2026-10-19T06:00:00Z');
    const runs = { ...healthy(), 'notify-4am.yml': '2026-10-16T11:00:00Z' };
    for (const k of Object.keys(runs)) if (k !== 'notify-4am.yml') runs[k] = hoursAgo(0.5, monday0600);
    expect(checkWorkflowRuns(runs, monday0600)).toEqual([]);
  });
});

describe('roster image', () => {
  it('HTTP 200 with image/png is not a finding', () => {
    expect(checkImage({ status: 200, contentType: 'image/png' })).toEqual([]);
  });

  it('HTTP 500 is a finding that names the status', () => {
    expect(checkImage({ status: 500, contentType: 'text/plain' })).toEqual(['Roster image broken: HTTP 500 (text/plain)']);
  });

  it('a PNG body with a non-200 status is a finding', () => {
    expect(checkImage({ status: 404, contentType: 'image/png' })).toEqual(['Roster image broken: HTTP 404 (image/png)']);
  });

  it('HTTP 200 that is not a PNG is a finding', () => {
    expect(checkImage({ status: 200, contentType: 'application/json' })).toHaveLength(1);
  });
});

describe('runOpsWatch', () => {
  function deps(over = {}) {
    const sent = { whatsapp: [], email: [] };
    return {
      sent,
      now: () => NOW,
      loadQueueStats: async () => ({ pendingCount: 0, oldestPendingAt: null, lastDoneAt: hoursAgo(5) }),
      loadRosterRows: async () => ({ sent: [{ wamid: 'w1', sent_at: '2026-10-16T11:00:05Z' }], deliveredWamids: ['w1'] }),
      loadLastSuccess: async () => ({
        'gmail-monitor.yml': hoursAgo(1),
        'integration-check.yml': hoursAgo(9),
        'cron-health-check.yml': hoursAgo(17),
        'notify-4am.yml': hoursAgo(6),
        'keepalive.yml': hoursAgo(24),
      }),
      fetchImage: async () => ({ status: 200, contentType: 'image/png' }),
      sendWhatsApp: async (text) => { sent.whatsapp.push(text); return true; },
      sendEmail: async (text) => { sent.email.push(text); return true; },
      ...over,
    };
  }

  it('a healthy day sends nothing and is ok', async () => {
    const d = deps();
    const r = await runOpsWatch(d);
    expect(r.findings).toEqual([]);
    expect(d.sent.whatsapp).toEqual([]);
    expect(d.sent.email).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('findings from several checks go out together in one WhatsApp and one email', async () => {
    const d = deps({
      fetchImage: async () => ({ status: 500, contentType: 'text/plain' }),
      loadRosterRows: async () => ({ sent: [], deliveredWamids: [] }),
    });
    const r = await runOpsWatch(d);
    expect(r.findings).toHaveLength(2);
    expect(d.sent.whatsapp).toHaveLength(1);
    expect(d.sent.email).toHaveLength(1);
    expect(d.sent.whatsapp[0]).toBe(
      '⚠️ Q Boarding ops watch (2026-10-16)\n• No morning roster sent today (2026-10-16)\n• Roster image broken: HTTP 500 (text/plain)',
    );
    expect(d.sent.email[0]).toBe(d.sent.whatsapp[0]);
    expect(r.ok).toBe(true);
  });

  it("a check that can't run is a finding that names it, and the run is not ok", async () => {
    const d = deps({ loadLastSuccess: async () => { throw new Error('GH_ACTIONS_TOKEN not set'); } });
    const r = await runOpsWatch(d);
    expect(r.findings).toEqual(["Couldn't check the scheduled workflows: GH_ACTIONS_TOKEN not set"]);
    expect(d.sent.whatsapp).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  it("each check that can't run is named", async () => {
    const boom = async () => { throw new Error('x'); };
    const r = await runOpsWatch(deps({ loadQueueStats: boom, loadRosterRows: boom, loadLastSuccess: boom, fetchImage: boom }));
    expect(r.findings).toEqual([
      "Couldn't check the sync queue: x",
      "Couldn't check the morning roster: x",
      "Couldn't check the scheduled workflows: x",
      "Couldn't check the roster image: x",
    ]);
  });

  it("one workflow GitHub couldn't be asked about makes the run not ok", async () => {
    const d = deps({ loadLastSuccess: async () => ({
      'gmail-monitor.yml': { error: 'HTTP 500' },
      'integration-check.yml': hoursAgo(9),
      'cron-health-check.yml': hoursAgo(17),
      'notify-4am.yml': hoursAgo(6),
      'keepalive.yml': hoursAgo(24),
    }) });
    const r = await runOpsWatch(d);
    expect(r.findings).toEqual(["Couldn't check workflow gmail-monitor: HTTP 500"]);
    expect(r.ok).toBe(false);
  });

  it('a finding is cut to 200 characters', async () => {
    const d = deps({ loadQueueStats: async () => { throw new Error('x'.repeat(500)); } });
    const r = await runOpsWatch(d);
    expect(r.findings[0]).toHaveLength(200);
  });

  it('the other checks still run when one fails', async () => {
    const d = deps({
      loadQueueStats: async () => { throw new Error('db down'); },
      fetchImage: async () => ({ status: 500, contentType: 'text/plain' }),
    });
    const r = await runOpsWatch(d);
    expect(r.findings).toHaveLength(2);
  });

  it('when WhatsApp fails the email still goes, and the run is not ok', async () => {
    const d = deps({
      fetchImage: async () => ({ status: 500, contentType: 'text/plain' }),
      sendWhatsApp: async () => { throw new Error('Meta 401'); },
    });
    const r = await runOpsWatch(d);
    expect(d.sent.email).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  it('when the email fails the WhatsApp still goes, and the run is not ok', async () => {
    const d = deps({
      fetchImage: async () => ({ status: 500, contentType: 'text/plain' }),
      sendEmail: async () => false,
    });
    const r = await runOpsWatch(d);
    expect(d.sent.whatsapp).toHaveLength(1);
    expect(r.ok).toBe(false);
  });
});
