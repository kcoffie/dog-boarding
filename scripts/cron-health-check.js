/* global process */
/**
 * Cron health check — verifies that each midnight Vercel cron ran successfully.
 *
 * Runs at 00:30 UTC (30 min after the midnight crons finish). Checks:
 *
 *   1. DID IT RUN?
 *      For each cron (auth, schedule, detail): if cron_health.last_ran_at is
 *      before midnight UTC today, the cron never ran tonight → alert.
 *
 *   2. DID IT SUCCEED?
 *      If cron_health.status = 'failure', check cron_health_log for the last
 *      2 entries. If both are failures → alert (consecutive = real problem).
 *      A single failure in a sea of successes is likely transient noise.
 *
 * Sends alerts to INTEGRATION_CHECK_RECIPIENTS via Meta Cloud API (same as the
 * integration-check.js path — Kate only, not the roster recipients).
 *
 * Exit codes: 0 on success or alerts-sent (job succeeded), 1 on startup crash.
 *
 * Required env vars (GitHub Actions Repository secrets):
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   META_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN
 *   INTEGRATION_CHECK_RECIPIENTS
 */

import { createClient } from '@supabase/supabase-js';
import { sendTextMessage, getAlertRecipients } from '../src/lib/notifyWhatsApp.js';

// The three midnight Vercel crons we monitor.
const MONITORED_CRONS = ['auth', 'schedule', 'detail'];

// A cron stuck in 'started' beyond this threshold is considered hung.
const HUNG_THRESHOLD_MIN = 20;

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// DB queries
// ---------------------------------------------------------------------------

/**
 * Load the latest cron_health row for each monitored cron.
 * Returns a Map<cronName, { last_ran_at, status }>.
 */
async function loadCronHealth(supabase) {
  console.log('[CronHealthCheck] Loading cron_health for monitored crons...');

  const { data, error } = await supabase
    .from('cron_health')
    .select('cron_name, last_ran_at, status')
    .in('cron_name', MONITORED_CRONS);

  if (error) throw error;

  const map = new Map();
  for (const row of (data || [])) {
    map.set(row.cron_name, { last_ran_at: row.last_ran_at, status: row.status });
  }

  console.log('[CronHealthCheck] Loaded %d cron_health row(s)', map.size);
  return map;
}

/**
 * For a given cron, return the last 2 log entries (newest first).
 * Used to distinguish transient vs. consecutive failures.
 */
async function loadRecentLog(supabase, cronName) {
  const { data, error } = await supabase
    .from('cron_health_log')
    .select('status, ran_at')
    .eq('cron_name', cronName)
    .order('ran_at', { ascending: false })
    .limit(2);

  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Check logic
// ---------------------------------------------------------------------------

/**
 * Check 1: Did the cron run since midnight UTC today?
 * The checker runs at 00:30 UTC. Any cron with last_ran_at < midnight today
 * has not run tonight.
 *
 * @param {string} cronName
 * @param {{ last_ran_at: string, status: string }|undefined} healthRow
 * @param {Date} midnightUtc - Start of today in UTC
 * @returns {string|null} - Alert message or null if ok
 */
export function checkDidRun(cronName, healthRow, midnightUtc) {
  if (!healthRow) {
    console.log('[CronHealthCheck] ⚠️  cron-%s: no health row in DB — never ran?', cronName);
    return `cron-${cronName}: no health record found — may have never run`;
  }

  const lastRan = new Date(healthRow.last_ran_at);
  if (lastRan < midnightUtc) {
    console.log(
      '[CronHealthCheck] ⚠️  cron-%s: last_ran_at=%s is before midnight UTC (%s) — did not run tonight',
      cronName,
      healthRow.last_ran_at,
      midnightUtc.toISOString(),
    );
    return `cron-${cronName}: did not run tonight (last ran ${healthRow.last_ran_at})`;
  }

  console.log('[CronHealthCheck] ✅ cron-%s: ran at %s (status: %s)', cronName, healthRow.last_ran_at, healthRow.status);
  return null;
}

/**
 * Check 2: Is the cron stuck in 'started' beyond the hung threshold?
 * A cron that wrote 'started' but never updated to 'success' or 'failure'
 * within HUNG_THRESHOLD_MIN minutes has likely hung or crashed mid-run.
 *
 * @param {string} cronName
 * @param {{ last_ran_at: string, status: string }|undefined} healthRow
 * @param {number} nowMs - Current timestamp in ms (Date.now())
 * @returns {string|null}
 */
export function checkHungCron(cronName, healthRow, nowMs) {
  if (!healthRow || healthRow.status !== 'started') return null;

  const startedAt = new Date(healthRow.last_ran_at).getTime();
  const elapsedMin = Math.round((nowMs - startedAt) / 60000);

  if (elapsedMin > HUNG_THRESHOLD_MIN) {
    console.log('[CronHealthCheck] ⚠️  cron-%s: stuck in started for %d min', cronName, elapsedMin);
    return `cron-${cronName}: hung in 'started' state for ${elapsedMin} min (started ${healthRow.last_ran_at})`;
  }

  console.log('[CronHealthCheck] cron-%s: status=started, elapsed %d min — still in progress', cronName, elapsedMin);
  return null;
}

/**
 * Check 3: If the cron's current status is 'failure', are the last 2 log
 * entries also failures? If yes → consecutive failures → alert.
 *
 * Single failures can be transient (Supabase blip, deploy race condition).
 * Two in a row signals a real issue that needs attention.
 *
 * @param {string} cronName
 * @param {{ last_ran_at: string, status: string }|undefined} healthRow
 * @param {Array<{ status: string, ran_at: string }>} recentLog
 * @returns {string|null}
 */
export function checkConsecutiveFailures(cronName, healthRow, recentLog) {
  if (!healthRow || healthRow.status !== 'failure') return null;

  // cron_health shows 'failure'. Check the last 2 log entries.
  const failures = recentLog.filter(r => r.status === 'failure');
  const consecutiveFails = failures.length >= 2;

  if (consecutiveFails) {
    console.log('[CronHealthCheck] ⚠️  cron-%s: %d consecutive failure(s) in log', cronName, failures.length);
    const rawError = failures[0]?.error_msg;
    const errorSuffix = rawError ? `: ${String(rawError).slice(0, 100)}` : '';
    return `cron-${cronName}: ${failures.length} consecutive failure(s)${errorSuffix}`.slice(0, 250);
  }

  // Single failure — transient, don't alert
  console.log('[CronHealthCheck] cron-%s: single failure (transient) — not alerting', cronName);
  return null;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

async function sendAlertMessage(message) {
  const recipients = getAlertRecipients();
  console.log('[CronHealthCheck] Sending WhatsApp to %d recipient(s)...', recipients.length);
  const results = await sendTextMessage(message, recipients);
  const sent = results.filter(r => r.status === 'sent').length;
  console.log('[CronHealthCheck] WhatsApp: %d/%d sent', sent, recipients.length);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[CronHealthCheck] === Cron health check starting ===');

  // Midnight UTC today = start of the window the midnight crons should have run in
  const now = new Date();
  const midnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  console.log('[CronHealthCheck] Checking for runs since %s', midnightUtc.toISOString());

  const todayStr = midnightUtc.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });

  const supabase = getSupabase();

  const healthMap = await loadCronHealth(supabase);

  const issues = [];

  for (const cronName of MONITORED_CRONS) {
    const healthRow = healthMap.get(cronName);

    // Check 1: did it run?
    const didNotRunAlert = checkDidRun(cronName, healthRow, midnightUtc);
    if (didNotRunAlert) {
      issues.push(didNotRunAlert);
      // If it didn't run, no point checking consecutive failures
      continue;
    }

    // Check 2: consecutive failures?
    let recentLog = [];
    try {
      recentLog = await loadRecentLog(supabase, cronName);
    } catch (err) {
      console.error('[CronHealthCheck] Could not load log for cron-%s: %s', cronName, err.message);
    }

    const failureAlert = checkConsecutiveFailures(cronName, healthRow, recentLog);
    if (failureAlert) {
      issues.push(failureAlert);
    }
  }

  const passed = issues.length === 0;
  console.log('[CronHealthCheck] Result: %s (%d issue(s))', passed ? 'PASS ✅' : 'FAIL ⚠️', issues.length);

  if (!passed) {
    const lines = [
      `⚠️ Cron health check (${todayStr})`,
      ...issues.map(i => `• ${i}`),
    ];
    const message = lines.join('\n');
    console.log('[CronHealthCheck] Sending alert:\n%s', message);
    await sendAlertMessage(message);
  } else {
    console.log('[CronHealthCheck] All crons healthy — no alert needed');
  }

  console.log('[CronHealthCheck] === Done ===');
  process.exit(0);
}

// Only run main() when executed directly — not when imported by tests.
if (process.argv[1]?.endsWith('cron-health-check.js')) {
  main().catch(err => {
    console.error('[CronHealthCheck] Unhandled error:', err.message, err.stack);
    process.exit(1);
  });
}
