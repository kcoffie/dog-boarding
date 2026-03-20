/**
 * Tests for cron-health-check.js pure logic functions.
 * @requirements REQ-v5.0-M1-1
 *
 * Covers all three checks:
 *   - checkDidRun: detects crons that didn't run tonight
 *   - checkHungCron: detects crons stuck in 'started' > HUNG_THRESHOLD_MIN
 *   - checkConsecutiveFailures: detects 2+ consecutive failures + surfaces error_msg
 */

import { describe, it, expect } from 'vitest';
import {
  checkDidRun,
  checkHungCron,
  checkConsecutiveFailures,
} from '../../scripts/cron-health-check.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MIDNIGHT_UTC = new Date('2026-03-20T00:00:00.000Z');

// last_ran_at values relative to the checker running at 00:30 UTC
const TONIGHT_STARTED  = '2026-03-20T00:00:05.000Z'; // ran tonight, 30 min ago
const TONIGHT_RECENT   = '2026-03-20T00:10:12.000Z'; // ran tonight, 20 min ago
const LAST_NIGHT       = '2026-03-19T00:00:05.000Z'; // yesterday — missed tonight

// nowMs: 00:30 UTC on 2026-03-20
const NOW_MS = new Date('2026-03-20T00:30:00.000Z').getTime();

// ---------------------------------------------------------------------------
// checkDidRun
// ---------------------------------------------------------------------------

describe('checkDidRun', () => {
  it('returns null when cron ran tonight', () => {
    const row = { last_ran_at: TONIGHT_STARTED, status: 'success' };
    expect(checkDidRun('auth', row, MIDNIGHT_UTC)).toBeNull();
  });

  it('returns alert string when last_ran_at is before midnight (missed tonight)', () => {
    const row = { last_ran_at: LAST_NIGHT, status: 'success' };
    const result = checkDidRun('schedule', row, MIDNIGHT_UTC);
    expect(result).toMatch(/cron-schedule/);
    expect(result).toMatch(/did not run tonight/);
    expect(result).toMatch(LAST_NIGHT);
  });

  it('returns alert string when healthRow is undefined (no DB record)', () => {
    const result = checkDidRun('detail', undefined, MIDNIGHT_UTC);
    expect(result).toMatch(/cron-detail/);
    expect(result).toMatch(/no health record/);
  });

  it('includes the cronName in the alert', () => {
    const row = { last_ran_at: LAST_NIGHT, status: 'success' };
    expect(checkDidRun('auth', row, MIDNIGHT_UTC)).toMatch('cron-auth');
  });
});

// ---------------------------------------------------------------------------
// checkHungCron
// ---------------------------------------------------------------------------

describe('checkHungCron', () => {
  it('returns null when status is success (not started)', () => {
    const row = { last_ran_at: TONIGHT_STARTED, status: 'success' };
    expect(checkHungCron('auth', row, NOW_MS)).toBeNull();
  });

  it('returns null when status is failure (not started)', () => {
    const row = { last_ran_at: TONIGHT_STARTED, status: 'failure' };
    expect(checkHungCron('auth', row, NOW_MS)).toBeNull();
  });

  it('returns null when healthRow is undefined', () => {
    expect(checkHungCron('auth', undefined, NOW_MS)).toBeNull();
  });

  it('returns alert when status=started AND elapsed > 20 minutes', () => {
    // Started at 00:00, checker at 00:30 = 30 min elapsed
    const row = { last_ran_at: TONIGHT_STARTED, status: 'started' };
    const result = checkHungCron('schedule', row, NOW_MS);
    expect(result).toMatch(/cron-schedule/);
    expect(result).toMatch(/hung/);
    expect(result).toMatch(/30 min/);
  });

  it('returns null when status=started but elapsed <= 20 minutes (still in progress)', () => {
    // Started at 00:20, checker at 00:30 = 10 min elapsed — fine
    const recentStart = new Date('2026-03-20T00:20:00.000Z').getTime();
    const row = { last_ran_at: new Date(recentStart).toISOString(), status: 'started' };
    expect(checkHungCron('detail', row, NOW_MS)).toBeNull();
  });

  it('returns alert at exactly the threshold boundary (21 min)', () => {
    const startedAt = NOW_MS - 21 * 60 * 1000;
    const row = { last_ran_at: new Date(startedAt).toISOString(), status: 'started' };
    const result = checkHungCron('auth', row, NOW_MS);
    expect(result).not.toBeNull();
    expect(result).toMatch(/hung/);
  });

  it('returns null at 20 min exactly (on the threshold)', () => {
    const startedAt = NOW_MS - 20 * 60 * 1000;
    const row = { last_ran_at: new Date(startedAt).toISOString(), status: 'started' };
    // 20 min rounds to 20, which is NOT > 20
    expect(checkHungCron('auth', row, NOW_MS)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkConsecutiveFailures
// ---------------------------------------------------------------------------

describe('checkConsecutiveFailures', () => {
  it('returns null when status is success', () => {
    const row = { last_ran_at: TONIGHT_STARTED, status: 'success' };
    expect(checkConsecutiveFailures('auth', row, [])).toBeNull();
  });

  it('returns null when status is started', () => {
    const row = { last_ran_at: TONIGHT_STARTED, status: 'started' };
    expect(checkConsecutiveFailures('auth', row, [])).toBeNull();
  });

  it('returns null when healthRow is undefined', () => {
    expect(checkConsecutiveFailures('auth', undefined, [])).toBeNull();
  });

  it('returns alert when status=failure and 2 log entries are both failures', () => {
    const row = { last_ran_at: TONIGHT_STARTED, status: 'failure' };
    const log = [
      { status: 'failure', ran_at: TONIGHT_STARTED, error_msg: 'Auth failed: timeout' },
      { status: 'failure', ran_at: LAST_NIGHT,      error_msg: 'Auth failed: timeout' },
    ];
    const result = checkConsecutiveFailures('auth', row, log);
    expect(result).toMatch(/cron-auth/);
    expect(result).toMatch(/consecutive failure/);
  });

  it('includes error_msg from most recent failure in the alert', () => {
    const row = { last_ran_at: TONIGHT_STARTED, status: 'failure' };
    const log = [
      { status: 'failure', ran_at: TONIGHT_STARTED, error_msg: 'Supabase connection refused' },
      { status: 'failure', ran_at: LAST_NIGHT,      error_msg: 'Supabase connection refused' },
    ];
    const result = checkConsecutiveFailures('schedule', row, log);
    expect(result).toMatch(/Supabase connection refused/);
  });

  it('does NOT alert on a single failure (transient noise)', () => {
    const row = { last_ran_at: TONIGHT_RECENT, status: 'failure' };
    const log = [
      { status: 'failure', ran_at: TONIGHT_RECENT, error_msg: 'fluke' },
      { status: 'success', ran_at: LAST_NIGHT,     error_msg: null },
    ];
    expect(checkConsecutiveFailures('detail', row, log)).toBeNull();
  });

  it('handles null error_msg gracefully (no error suffix in alert)', () => {
    const row = { last_ran_at: TONIGHT_STARTED, status: 'failure' };
    const log = [
      { status: 'failure', ran_at: TONIGHT_STARTED, error_msg: null },
      { status: 'failure', ran_at: LAST_NIGHT,      error_msg: null },
    ];
    const result = checkConsecutiveFailures('auth', row, log);
    expect(result).toMatch(/consecutive failure/);
    // No crash, no undefined in the message
    expect(result).not.toMatch(/undefined/);
    expect(result).not.toMatch(/null/);
  });

  it('truncates long error_msg to avoid bloated WhatsApp messages', () => {
    const longError = 'x'.repeat(200);
    const row = { last_ran_at: TONIGHT_STARTED, status: 'failure' };
    const log = [
      { status: 'failure', ran_at: TONIGHT_STARTED, error_msg: longError },
      { status: 'failure', ran_at: LAST_NIGHT,      error_msg: longError },
    ];
    const result = checkConsecutiveFailures('auth', row, log);
    // The message should be capped — not 200+ chars of the error alone
    expect(result.length).toBeLessThan(300);
  });
});
