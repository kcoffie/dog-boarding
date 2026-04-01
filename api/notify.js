/**
 * Notification orchestrator — sends the daily roster image via WhatsApp.
 *
 * GET /api/notify?window=4am&token=SECRET[&date=YYYY-MM-DD]
 *
 * Called by three GitHub Actions workflows at 4am, 7am, and 8:30am PST.
 * The `window` param drives the send gate:
 *   4am     → always send (first send of the day)
 *   7am     → send only if data changed since last send
 *   8:30am  → send only if data changed since last send
 *
 * Change detection: after each send, the data hash is stored in the
 * cron_health table (cron_name='notify') under result.lastHash + lastDate.
 * Subsequent sends within the same calendar date compare against this hash.
 *
 * Image URL: constructed from the request's own Host header — works for any
 * deployment URL (production, preview, local). Twilio fetches the image from
 * our own /api/roster-image endpoint at delivery time.
 *
 * Runs on Node.js runtime — required by the Meta fetch calls and Supabase client.
 *
 * @requirements REQ-v4.1, REQ-v5.0-M0
 */

import { createClient } from '@supabase/supabase-js';
import {
  getPictureOfDay,
  parseDateParam,
  shouldSendNotification,
} from '../src/lib/pictureOfDay.js';
import {
  sendRosterImage,
  sendTextMessage,
  getRecipients,
} from '../src/lib/notifyWhatsApp.js';
import { writeCronHealth } from './_cronHealth.js';
import { refreshDaytimeSchedule } from '../src/lib/notifyHelpers.js';

export const config = { runtime: 'nodejs' };

const VALID_WINDOWS = ['4am', '7am', '8:30am', 'friday-pm'];

// refreshDaytimeSchedule is imported from src/lib/notifyHelpers.js (extracted for testability).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Send a plain-text WhatsApp alert when the daytime schedule refresh fails or
 * returns no events. Non-fatal — errors are caught and logged.
 *
 * Deduplication: only fires once per calendar date. Subsequent windows (7am,
 * 8:30am) with the same root cause are suppressed so a single session failure
 * doesn't generate 3 identical WhatsApp alerts. The send is recorded in
 * cron_health under 'notify-refresh-alert' with the date as a key.
 *
 * Sends to NOTIFY_RECIPIENTS (same as the roster) so the alert is visible
 * alongside the morning image and can be investigated before the next window.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} warning
 * @param {string} dateStr - YYYY-MM-DD of the day being notified
 * @param {string} notifyWindow - '4am' | '7am' | '8:30am'
 */
async function sendRefreshAlert(supabase, warning, dateStr, notifyWindow) {
  // Deduplicate: check if we already sent a refresh alert for this date
  try {
    const { data: last } = await supabase
      .from('cron_health')
      .select('result')
      .eq('cron_name', 'notify-refresh-alert')
      .maybeSingle();

    if (last?.result?.alertDate === dateStr) {
      console.log(`[Notify/RefreshAlert] Already sent refresh alert for ${dateStr} (window: ${last.result.window}) — suppressing duplicate`);
      return;
    }
  } catch (err) {
    // Non-fatal — if we can't read the dedup state, send the alert anyway
    console.warn(`[Notify/RefreshAlert] Could not read dedup state: ${err.message} — sending alert`);
  }

  const recipients = getRecipients();
  if (recipients.length === 0) return;

  const body = `⚠️ Notify refresh issue (${dateStr}, ${notifyWindow})\n${warning}`;
  await sendTextMessage(body, recipients).catch(err =>
    console.warn(`[Notify/RefreshAlert] sendTextMessage failed: ${err.message}`)
  );

  // Record that we sent the alert for this date (non-fatal)
  await writeCronHealth(supabase, 'notify-refresh-alert', 'success', {
    alertDate: dateStr,
    window: notifyWindow,
    warning,
    sentAt: new Date().toISOString(),
  }, null).catch(err =>
    console.warn(`[Notify/RefreshAlert] Could not record dedup state: ${err.message}`)
  );
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

/**
 * Read the last sent notification state from cron_health.
 * Returns { lastHash, lastDate } or null if no prior send exists.
 *
 * Error-handling: returns null on DB error so the send still proceeds
 * (conservative: better to send a duplicate than to silently block).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{lastHash: string, lastDate: string}|null>}
 */
async function readLastSentState(supabase) {
  const { data, error } = await supabase
    .from('cron_health')
    .select('result')
    .eq('cron_name', 'notify')
    .maybeSingle();

  if (error) {
    console.warn('[Notify] Could not read last sent state:', error.message, '— proceeding without baseline');
    return null;
  }

  if (!data?.result?.lastHash) return null;

  return {
    lastHash: data.result.lastHash,
    lastDate: data.result.lastDate || '',
  };
}

/**
 * Persist the just-sent hash so future sends in the same day can compare.
 * Non-fatal — a failed write doesn't block the caller.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} hash
 * @param {string} dateStr - YYYY-MM-DD of the picture that was sent
 * @param {string} window  - '4am' | '7am' | '8:30am'
 * @param {Array} sendResults - From sendRosterImage
 */
async function persistSentState(supabase, hash, dateStr, window, sendResults) {
  await writeCronHealth(supabase, 'notify', 'success', {
    lastHash: hash,
    lastDate: dateStr,
    window,
    sentAt: new Date().toISOString(),
    recipients: sendResults.map(r => r.to), // already masked
    results: sendResults,
  }, null);
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Auth: token validation ---
  const providedToken = req.query.token || '';
  const expectedToken = process.env.VITE_SYNC_PROXY_TOKEN || '';
  if (!expectedToken || providedToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // --- Input validation: window param ---
  const window = req.query.window || '';
  if (!VALID_WINDOWS.includes(window)) {
    return res.status(400).json({
      error: `Invalid window: "${window}". Must be one of: ${VALID_WINDOWS.join(', ')}`,
    });
  }

  // Capture job run time now — passed to roster-image.js via ts param so the image
  // can display "as of [time], [day] [M/D]" reflecting when this notify job executed.
  const jobRunAt = new Date().toISOString();

  // --- friday-pm: distinct path — no hash gate, no getPictureOfDay ---
  if (window === 'friday-pm') {
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const imageUrl = `${protocol}://${host}/api/roster-image?type=weekend&token=${expectedToken}&ts=${encodeURIComponent(jobRunAt)}`;
      console.log(`[Notify] friday-pm — image URL: ${protocol}://${host}/api/roster-image?type=weekend&token=***&ts=${encodeURIComponent(jobRunAt)}`);

      const recipients = getRecipients();
      if (recipients.length === 0) {
        console.warn('[Notify] NOTIFY_RECIPIENTS not configured — send skipped');
        return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_recipients', window });
      }

      const supabase = getSupabase();
      console.log(`[Notify] Sending weekend roster to ${recipients.length} recipient(s)`);
      const sendResults = await sendRosterImage(imageUrl, recipients);
      await writeCronHealth(supabase, 'notify-friday-pm', 'success', {
        sentAt: new Date().toISOString(),
        recipients: sendResults.map(r => r.to),
        results: sendResults,
      }, null);

      const sentCount = sendResults.filter(r => r.status === 'sent').length;
      const failedCount = sendResults.filter(r => r.status === 'failed').length;
      console.log(`[Notify] friday-pm complete — ${sentCount} sent, ${failedCount} failed`);
      return res.status(200).json({ ok: true, action: 'sent', window, sentCount, failedCount, results: sendResults });
    } catch (err) {
      console.error('[Notify] ❌ friday-pm error:', err.message, err.stack);
      try {
        const supabase = getSupabase();
        await writeCronHealth(supabase, 'notify-friday-pm', 'failure', null, err.message.slice(0, 500));
      } catch { /* ignore */ }
      return res.status(500).json({ error: err.message });
    }
  }

  // --- Input validation: date param (defaults to today) ---
  let date;
  const dateParam = req.query.date;
  if (dateParam) {
    try {
      date = parseDateParam(dateParam);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  } else {
    // Default to today in Pacific time (America/Los_Angeles — where the business operates).
    // new Date() on a UTC Vercel server gives UTC, which can be one calendar day ahead of
    // Pacific between midnight–7am UTC (4pm–midnight Pacific). Using Intl ensures the date
    // reflects the correct Pacific calendar day regardless of server timezone.
    const pacificDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
    }).format(new Date());
    date = parseDateParam(pacificDateStr);
  }

  const dateStr = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

  console.log(`[Notify] Entry — window: ${window}, date: ${dateStr}`);

  try {
    const supabase = getSupabase();

    // --- Live schedule refresh (best-effort pre-flight) ---
    // Refreshes daytime_appointments so the hash-change gate at 7am/8:30am
    // compares against current data, not stale midnight-cron data.
    // Decision: non-fatal — if refresh fails, getPictureOfDay reads stale DB rows.
    console.log(`[Notify] Starting live schedule refresh for ${dateStr}`);
    const refresh = await refreshDaytimeSchedule(supabase, date);
    console.log(`[Notify] Refresh result: refreshed=${refresh.refreshed}, rowCount=${refresh.rowCount}${refresh.warning ? `, warning: ${refresh.warning}` : ''}`);

    // Alert on any refresh failure or zero-parse result — these are silent in Vercel
    // logs (1-hour retention) so a WhatsApp is the only durable signal.
    // sendRefreshAlert deduplicates — only the first window fires per day.
    if (refresh.warning) {
      await sendRefreshAlert(supabase, refresh.warning, dateStr, window).catch(err =>
        console.warn(`[Notify] Failed to send refresh alert: ${err.message}`)
      );
    }

    // --- Fetch picture data ---
    console.log(`[Notify] Fetching picture data for ${dateStr}`);
    const data = await getPictureOfDay(supabase, date);
    console.log(`[Notify] Data: ${data.workers.length} workers, hasUpdates: ${data.hasUpdates}, lastSyncedAt: ${data.lastSyncedAt ?? 'none'}`);

    // Guard: 0 workers means the midnight cron hasn't run yet for today (or refresh failed).
    // Sending would produce a near-blank image (header bar only). Skip and let the next
    // window (7am or 8:30am) retry after the cron has had time to complete.
    if (data.workers.length === 0) {
      console.warn(`[Notify] No worker data for today — skipping send (refreshed=${refresh.refreshed}, rowCount=${refresh.rowCount})`);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_data' });
    }

    // --- Read last sent state (for 7am/8:30am gate) ---
    const lastState = await readLastSentState(supabase);
    console.log(`[Notify] Last state: ${lastState ? `hash ${lastState.lastHash} on ${lastState.lastDate}` : 'none'}`);

    // Decision: if last send was for a different date, treat as no baseline.
    // This ensures the 7am gate doesn't compare against yesterday's hash.
    const lastHash = (lastState?.lastDate === dateStr) ? lastState.lastHash : null;
    if (lastState?.lastDate && lastState.lastDate !== dateStr) {
      console.log(`[Notify] Last send was for ${lastState.lastDate} (different date) — resetting baseline`);
    }

    // --- Send gate decision ---
    const { shouldSend, reason, currentHash } = shouldSendNotification(window, data, lastHash);
    console.log(`[Notify] shouldSend: ${shouldSend}, reason: ${reason}, hash: ${currentHash}`);

    if (!shouldSend) {
      return res.status(200).json({
        ok: true,
        action: 'skipped',
        reason,
        window,
        date: dateStr,
      });
    }

    // --- Construct image URL ---
    // Use the request's own host so this works for any deployment (prod, preview, local).
    // ts param passes the job run time to roster-image.js for the "as of" header line.
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const imageUrl = `${protocol}://${host}/api/roster-image?date=${dateStr}&token=${expectedToken}&ts=${encodeURIComponent(jobRunAt)}`;
    console.log(`[Notify] Image URL: ${protocol}://${host}/api/roster-image?date=${dateStr}&token=***&ts=${encodeURIComponent(jobRunAt)}`);

    // --- Get recipients ---
    const recipients = getRecipients();
    if (recipients.length === 0) {
      console.warn('[Notify] NOTIFY_RECIPIENTS not configured — send skipped');
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_recipients' });
    }

    // --- Send ---
    console.log(`[Notify] Sending to ${recipients.length} recipient(s)`);
    const sendResults = await sendRosterImage(imageUrl, recipients);

    // --- Persist state (non-fatal) ---
    await persistSentState(supabase, currentHash, dateStr, window, sendResults);

    const sentCount = sendResults.filter(r => r.status === 'sent').length;
    const failedCount = sendResults.filter(r => r.status === 'failed').length;
    console.log(`[Notify] Complete — ${sentCount} sent, ${failedCount} failed`);

    return res.status(200).json({
      ok: true,
      action: 'sent',
      window,
      date: dateStr,
      sentCount,
      failedCount,
      results: sendResults,
    });

  } catch (err) {
    console.error('[Notify] ❌ Unhandled error:', err.message, err.stack);
    try {
      const supabase = getSupabase();
      await writeCronHealth(supabase, 'notify', 'failure', null, err.message.slice(0, 500));
    } catch { /* ignore — health write failure should not mask the original error */ }
    return res.status(500).json({ error: err.message });
  }
}
