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
import { recordSentMessages, recordMessageLog } from '../src/lib/messageDeliveryStatus.js';
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
  const refreshResults = await sendTextMessage(body, recipients).catch(err => {
    console.warn(`[Notify/RefreshAlert] sendTextMessage failed: ${err.message}`);
    return [];
  });
  await recordSentMessages(supabase, refreshResults, 'notify-refresh-alert').catch(err =>
    console.warn(`[Notify/RefreshAlert] Failed to record delivery status: ${err.message}`)
  );
  console.log(`[Notify] Recording message_log — job: notify-refresh-alert, content length: ${body.length} chars`);
  await recordMessageLog(supabase, refreshResults, 'notify-refresh-alert', 'text', body, null).catch(err =>
    console.warn(`[Notify/RefreshAlert] Failed to record message_log: ${err.message}`)
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
 * Fetch the roster image PNG from imageUrl and upload it to Supabase Storage.
 * Returns the storage path (e.g. 'roster-images/notify-4am/2026-04-22T11:00:00.000Z.png')
 * or null if the fetch or upload fails. Non-fatal — failures are logged and swallowed
 * so the caller can still record the message_log row with a null image_path.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} imageUrl  - Full URL to /api/roster-image (auth token included)
 * @param {string} jobName   - e.g. 'notify-4am', 'notify-friday-pm'
 * @param {string} jobRunAt  - ISO timestamp captured at handler entry
 * @returns {Promise<string|null>}
 */
async function storeRosterImage(supabase, imageUrl, jobName, jobRunAt) {
  const logHost = new URL(imageUrl).host;
  console.log(`[ImageStore] Fetching image for storage — host: ${logHost}, job: ${jobName}`);

  let buffer;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(`[ImageStore] Image fetch failed (HTTP ${response.status}) — skipping storage, message_log row will have null image_path`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    console.log(`[ImageStore] Fetched ${buffer.length} bytes`);
  } catch (err) {
    console.warn(`[ImageStore] Image fetch error: ${err.message} — skipping storage, message_log row will have null image_path`);
    return null;
  }

  // Safe filename: replace colons in the ISO timestamp so all storage backends accept it
  const safeTimestamp = jobRunAt.replace(/:/g, '-');
  const pathInBucket = `${jobName}/${safeTimestamp}.png`;
  const fullPath = `roster-images/${pathInBucket}`;
  console.log(`[ImageStore] Uploading to Supabase Storage — path: ${fullPath}`);

  try {
    const { error } = await supabase.storage
      .from('roster-images')
      .upload(pathInBucket, buffer, { contentType: 'image/png', upsert: true });

    if (error) {
      console.warn(`[ImageStore] Storage upload failed: ${error.message} — skipping storage, message_log row will have null image_path`);
      return null;
    }
  } catch (err) {
    console.warn(`[ImageStore] Storage upload error: ${err.message} — skipping storage, message_log row will have null image_path`);
    return null;
  }

  console.log(`[ImageStore] Upload complete — ${fullPath}`);
  return fullPath;
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
    lastSnapshot: data.result.snapshot || null,
  };
}

/**
 * Store the 8:30am boarders snapshot in cron_health under 'boarders-snapshot'.
 * The hourly intraday job reads this to compute additions/cancellations since 8:30am.
 * Stored regardless of whether the 8:30am notify actually sends — the snapshot is
 * always captured so the hourly job has a baseline even on no-change days.
 *
 * Non-fatal — a failed write logs a warning but does not block the notify send.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{name: string, arrival_datetime: string, departure_datetime: string}>} boarders
 * @param {string} dateStr - YYYY-MM-DD
 */
async function storeBoardersSnapshot(supabase, boarders, dateStr) {
  const snapshot = boarders.map(b => ({
    name: b.name,
    arrival_datetime: b.arrival_datetime,
    departure_datetime: b.departure_datetime,
  }));
  await writeCronHealth(supabase, 'boarders-snapshot', 'success', {
    snapshotDate: dateStr,
    boarders: snapshot,
    capturedAt: new Date().toISOString(),
  }, null).catch(err =>
    console.warn(`[Notify/Snapshot] Failed to store boarders snapshot: ${err.message}`)
  );
  console.log(`[Notify/Snapshot] Stored boarders snapshot for ${dateStr} — ${snapshot.length} boarders: [${snapshot.map(b => b.name).join(', ')}]`);
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
async function persistSentState(supabase, hash, dateStr, window, sendResults, workers) {
  await writeCronHealth(supabase, 'notify', 'success', {
    lastHash: hash,
    lastDate: dateStr,
    window,
    sentAt: new Date().toISOString(),
    recipients: sendResults.map(r => r.to), // already masked
    results: sendResults,
    snapshot: workers,
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
      await recordSentMessages(supabase, sendResults, 'notify-friday-pm').catch(err =>
        console.warn(`[Notify] Failed to record delivery status (friday-pm): ${err.message}`)
      );
      const fridayImagePath = await storeRosterImage(supabase, imageUrl, 'notify-friday-pm', jobRunAt);
      console.log(`[Notify] Storing roster image and recording message_log — job: notify-friday-pm, imagePath: ${fridayImagePath ?? 'null'}`);
      await recordMessageLog(supabase, sendResults, 'notify-friday-pm', 'image', null, fridayImagePath).catch(err =>
        console.warn(`[Notify] Failed to record message_log (friday-pm): ${err.message}`)
      );
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

    // --- Store 8:30am boarders snapshot (J-1 baseline) ---
    // Stored before the send-gate check so the hourly intraday job always has a baseline,
    // even when 8:30am skips sending due to no change in the roster.
    if (window === '8:30am') {
      await storeBoardersSnapshot(supabase, data.boarders, dateStr);
    }

    // --- Read last sent state (for 7am/8:30am gate) ---
    const lastState = await readLastSentState(supabase);
    console.log(`[Notify] Last state: ${lastState ? `hash ${lastState.lastHash} on ${lastState.lastDate}` : 'none'}`);

    // Decision: if last send was for a different date, treat as no baseline.
    // This ensures the 7am gate doesn't compare against yesterday's hash.
    const sameDate = lastState?.lastDate === dateStr;
    const lastHash = sameDate ? lastState.lastHash : null;
    // lastSnapshot: only used for intra-day blue overlay on 7am/8:30am. Not needed for 4am.
    const lastSnapshot = (window !== '4am' && sameDate) ? (lastState.lastSnapshot || null) : null;
    if (lastState?.lastDate && !sameDate) {
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
    // sendWindow drives badge suppression (4am has no prior send to diff against).
    // lastSnapshot (7am/8:30am only) enables the blue intra-day overlay in roster-image.js.
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let imageUrl = `${protocol}://${host}/api/roster-image?date=${dateStr}&token=${expectedToken}&ts=${encodeURIComponent(jobRunAt)}&sendWindow=${window}`;
    if (lastSnapshot) {
      imageUrl += `&lastSnapshot=${Buffer.from(JSON.stringify(lastSnapshot)).toString('base64')}`;
    }
    console.log(`[Notify] Image URL: ${protocol}://${host}/api/roster-image?date=${dateStr}&token=***&ts=${encodeURIComponent(jobRunAt)}&sendWindow=${window}${lastSnapshot ? '&lastSnapshot=<snapshot>' : ''}`);

    // --- Get recipients ---
    const recipients = getRecipients();
    if (recipients.length === 0) {
      console.warn('[Notify] NOTIFY_RECIPIENTS not configured — send skipped');
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_recipients' });
    }

    // --- Send ---
    console.log(`[Notify] Sending to ${recipients.length} recipient(s)`);
    const sendResults = await sendRosterImage(imageUrl, recipients);

    // --- Record wamids for delivery observability (non-fatal) ---
    await recordSentMessages(supabase, sendResults, `notify-${window}`).catch(err =>
      console.warn(`[Notify] Failed to record delivery status (${window}): ${err.message}`)
    );

    // --- Store roster image + record message log (non-fatal) ---
    const imagePath = await storeRosterImage(supabase, imageUrl, `notify-${window}`, jobRunAt);
    console.log(`[Notify] Storing roster image and recording message_log — job: notify-${window}, imagePath: ${imagePath ?? 'null'}`);
    await recordMessageLog(supabase, sendResults, `notify-${window}`, 'image', null, imagePath).catch(err =>
      console.warn(`[Notify] Failed to record message_log (${window}): ${err.message}`)
    );

    // --- Persist state (non-fatal) ---
    await persistSentState(supabase, currentHash, dateStr, window, sendResults, data.workers);

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
