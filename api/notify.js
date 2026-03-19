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
 * Runs on Node.js runtime — Twilio SDK requires Node.js.
 *
 * @requirements REQ-v4.1
 */

import { createClient } from '@supabase/supabase-js';
import {
  getPictureOfDay,
  parseDateParam,
  shouldSendNotification,
} from '../src/lib/pictureOfDay.js';
import {
  createTwilioClient,
  sendRosterImage,
  getRecipients,
} from '../src/lib/notifyWhatsApp.js';
import { writeCronHealth } from './_cronHealth.js';
import { ensureSession, clearSession } from '../src/lib/scraper/sessionCache.js';
import { setSession, authenticatedFetch } from '../src/lib/scraper/auth.js';
import { parseDaytimeSchedulePage, upsertDaytimeAppointments } from '../src/lib/scraper/daytimeSchedule.js';

export const config = { runtime: 'nodejs' };

const VALID_WINDOWS = ['4am', '7am', '8:30am', 'friday-pm'];
const BASE_URL = process.env.VITE_EXTERNAL_SITE_URL || 'https://agirlandyourdog.com';

// ---------------------------------------------------------------------------
// Live schedule refresh
// ---------------------------------------------------------------------------

/**
 * Refresh today's daytime schedule data from the external site before building
 * the image. This ensures the 7am and 8:30am sends reflect actual changes made
 * after the midnight cron ran, making the hash-change gate meaningful.
 *
 * Strategy: mirrors the fetch + parse + upsert pattern from cron-schedule.js
 * lines 216–274, but scoped to just the current day and with no side effects
 * on boarding sync state.
 *
 * Error-handling: ALL errors are caught internally — this is a best-effort
 * pre-flight. A missing session, failed fetch, or upsert error logs a warning
 * and returns { refreshed: false } so the caller continues with stale DB data.
 * The send must never be blocked by a refresh failure.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Date} date - Local Date for the day being notified (usually today)
 * @returns {Promise<{ refreshed: boolean, rowCount: number, warning: string|null }>}
 */
async function refreshDaytimeSchedule(supabase, date) {
  // Outer try/catch ensures this function NEVER throws — every exit path returns
  // { refreshed: boolean, rowCount: number, warning: string|null }.
  // Docstring contract: "non-fatal pre-flight."
  try {
    // ensureSession: returns cached session or re-authenticates if expired/missing.
    // Throws only if credentials are missing or auth fails — caught by outer catch.
    let cookies;
    try {
      cookies = await ensureSession(supabase);
    } catch (sessionErr) {
      console.warn(`[Notify/Refresh] Could not obtain session: ${sessionErr.message} — skipping live refresh, using stale DB data`);
      return { refreshed: false, rowCount: 0, warning: `Session unavailable: ${sessionErr.message}` };
    }

    // Inject session cookies so authenticatedFetch uses them.
    setSession(cookies);

    // Build the week-page URL for today. Month and day are NOT zero-padded —
    // the external site uses bare numbers in its URL (e.g. /schedule/days-7/2026/3/6).
    const y = date.getFullYear();
    const m = date.getMonth() + 1; // 0-indexed → 1-indexed
    const d = date.getDate();
    const url = `${BASE_URL}/schedule/days-7/${y}/${m}/${d}`;
    console.log(`[Notify/Refresh] Fetching schedule for ${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')} from ${url}`);

    let html;
    try {
      const response = await authenticatedFetch(url);
      html = await response.text();
    } catch (err) {
      // Decision: SESSION_EXPIRED means the cached session was rejected by the server.
      // Clear it so cron-auth re-authenticates on its next run rather than leaving a
      // poisoned session in the cache that would cause the same failure at 7am and 8:30am.
      if (err.message === 'SESSION_EXPIRED') {
        console.warn('[Notify/Refresh] Session expired — clearing cached session so cron-auth re-authenticates');
        await clearSession(supabase).catch(e =>
          console.warn(`[Notify/Refresh] clearSession also failed: ${e.message}`)
        );
        return { refreshed: false, rowCount: 0, warning: 'Session expired — cron-auth will re-authenticate at midnight' };
      }
      console.warn(`[Notify/Refresh] Fetch failed (${err.message}) — continuing with stale DB data`);
      return { refreshed: false, rowCount: 0, warning: `Schedule fetch failed: ${err.message}` };
    }

    console.log(`[Notify/Refresh] Fetched HTML — ${html.length} bytes`);

    // Parse all daytime events (DC, PG, Boarding) from the schedule HTML.
    const rows = parseDaytimeSchedulePage(html);
    console.log(`[Notify/Refresh] Parsed ${rows.length} daytime events`);

    // Surface zero-parse as a warning — could be access-denied redirect (large HTML)
    // or empty/malformed response (small HTML). Either way the DB won't be updated.
    let parseWarning = null;
    if (rows.length === 0) {
      const sizeNote = html.length > 10000 ? 'possible access-denied redirect' : 'small/empty response';
      console.warn(`[Notify/Refresh] 0 events parsed from ${html.length}-byte response — ${sizeNote}`);
      if (html.length > 10000) {
        console.warn(`[Notify/Refresh] HTML preview: ${html.slice(0, 150).replace(/\s+/g, ' ')}`);
      }
      parseWarning = `Schedule fetched (${html.length} bytes) but 0 daytime events parsed — ${sizeNote}`;
    }

    // Upsert to DB. Non-fatal: upsertDaytimeAppointments does not throw on DB
    // errors — it returns { upserted, errors } — so we log and carry on.
    const { upserted, errors } = await upsertDaytimeAppointments(supabase, rows);
    if (errors > 0) {
      console.warn(`[Notify/Refresh] Upsert completed with ${errors} error(s) — ${upserted} rows written`);
    } else {
      console.log(`[Notify/Refresh] Upserted ${upserted} rows`);
    }

    return { refreshed: true, rowCount: upserted, warning: parseWarning };

  } catch (err) {
    // Catch-all: any unexpected error (getSession DB failure, parse crash, etc.)
    // must not propagate — the send must not be blocked by a refresh failure.
    console.warn(`[Notify/Refresh] Unexpected error: ${err.message} — continuing with stale DB data`);
    return { refreshed: false, rowCount: 0, warning: `Unexpected refresh error: ${err.message}` };
  }
}

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

  const from = process.env.TWILIO_FROM_NUMBER;
  const recipients = getRecipients();
  if (!from || recipients.length === 0) return;

  let client;
  try {
    client = createTwilioClient();
  } catch (err) {
    console.warn(`[Notify/RefreshAlert] Cannot create Twilio client: ${err.message}`);
    return;
  }

  const body = `⚠️ Notify refresh issue (${dateStr}, ${notifyWindow})\n${warning}`;
  for (const to of recipients) {
    await client.messages
      .create({ from: `whatsapp:${from}`, to: `whatsapp:${to}`, body })
      .catch(err => console.warn(`[Notify/RefreshAlert] Send failed to ***${to.slice(-4)}: ${err.message}`));
  }

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

  // --- friday-pm: distinct path — no hash gate, no getPictureOfDay ---
  if (window === 'friday-pm') {
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const imageUrl = `${protocol}://${host}/api/roster-image?type=weekend&token=${expectedToken}`;
      console.log(`[Notify] friday-pm — image URL: ${protocol}://${host}/api/roster-image?type=weekend&token=***`);

      const recipients = getRecipients();
      if (recipients.length === 0) {
        console.warn('[Notify] NOTIFY_RECIPIENTS not configured — send skipped');
        return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_recipients', window });
      }
      const fromNumber = process.env.TWILIO_FROM_NUMBER;
      if (!fromNumber) {
        console.warn('[Notify] TWILIO_FROM_NUMBER not configured — send skipped');
        return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_from_number', window });
      }

      const supabase = getSupabase();
      const twilioClient = createTwilioClient();
      console.log(`[Notify] Sending weekend roster to ${recipients.length} recipient(s)`);
      const sendResults = await sendRosterImage(twilioClient, imageUrl, recipients, fromNumber);
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
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const imageUrl = `${protocol}://${host}/api/roster-image?date=${dateStr}&token=${expectedToken}`;
    console.log(`[Notify] Image URL: ${protocol}://${host}/api/roster-image?date=${dateStr}&token=***`);

    // --- Get recipients and Twilio client ---
    const recipients = getRecipients();
    if (recipients.length === 0) {
      console.warn('[Notify] NOTIFY_RECIPIENTS not configured — send skipped');
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_recipients' });
    }

    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    if (!fromNumber) {
      console.warn('[Notify] TWILIO_FROM_NUMBER not configured — send skipped');
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_from_number' });
    }

    const twilioClient = createTwilioClient();

    // --- Send ---
    console.log(`[Notify] Sending to ${recipients.length} recipient(s)`);
    const sendResults = await sendRosterImage(twilioClient, imageUrl, recipients, fromNumber);

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
