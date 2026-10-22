/**
 * Notification orchestrator — sends the daily roster image on the ROSTER_CHANNEL (REQ-655).
 *
 * GET /api/notify?window=4am&token=SECRET[&date=YYYY-MM-DD][&force=1]
 * GET /api/notify with `Authorization: Bearer $CRON_SECRET` — the on-time 4am trigger (Vercel cron, REQ-658)
 *
 * The 4am roster: Vercel crons at 11:00 and 12:00 UTC send it in the 4am Pacific hour; the GitHub
 * workflow (14:00 UTC) is the late fallback. Both claim the Pacific day first, so it goes out once
 * (src/lib/rosterTrigger.js). The 7am and 8:30am windows are GitHub workflows.
 * The `window` param drives the send gate:
 *   4am     → send whatever the hash (first send of the day), once a day for the automatic calls
 *   7am     → send only if data changed since last send
 *   8:30am  → send only if data changed since last send
 *
 * Change detection: after each send, the data hash is stored in the
 * cron_health table (cron_name='notify') under result.lastHash + lastDate.
 * Subsequent sends within the same calendar date compare against this hash.
 *
 * Image: rendered by our own /api/roster-image (on the request's host; the on-time trigger uses the
 * production domain), fetched once, stored, and those same bytes are sent. The URL carries the token, so it never goes to the
 * channel or into an error.
 *
 * @requirements REQ-v4.1, REQ-v5.0-M0, REQ-655, REQ-658
 */

import { createClient } from '@supabase/supabase-js';
import {
  getPictureOfDay,
  parseDateParam,
  shouldSendNotification,
} from '../src/lib/pictureOfDay.js';
import { readRosterChannel, fetchRosterPng, sendRoster } from '../src/lib/rosterChannel.js';
import { alertAndLog } from '../src/lib/alertKate.js';
import { recordMessageLog } from '../src/lib/messageDeliveryStatus.js';
import { writeCronHealth } from './_cronHealth.js';
import { refreshDaytimeSchedule } from '../src/lib/notifyHelpers.js';
import {
  ALERT_JOB, pacificClock, onTimeWindowOpen, fallbackHourReached, readClaim, claimDay, finishClaim,
  missReason, noDataAlreadyReported, lateSendAlert, missedAlert, noDataAlert, isWeekday, rosterSentToday,
} from '../src/lib/rosterTrigger.js';
import { PROD_URL } from '../src/lib/deployCheck.js';

export const config = { runtime: 'nodejs' };

const VALID_WINDOWS = ['4am', '7am', '8:30am', 'friday-pm'];

// refreshDaytimeSchedule is imported from src/lib/notifyHelpers.js (extracted for testability).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Alert Kate (Telegram, alertAndLog) when the daytime schedule refresh fails or
 * returns no events. Non-fatal — errors are caught and logged.
 *
 * Deduplication: only fires once per calendar date. Subsequent windows (7am,
 * 8:30am) with the same root cause are suppressed so a single session failure
 * doesn't generate 3 identical alerts. A delivered alert is recorded in
 * cron_health under 'notify-refresh-alert' with the date as a key; an undelivered
 * one isn't, so the next window tries again (and ops-watch reports the failed row).
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

  const body = `⚠️ Notify refresh issue (${dateStr}, ${notifyWindow})\n${warning}`;
  const delivered = await alertAndLog(supabase, 'notify-refresh-alert', body);
  if (!delivered) return;

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

/**
 * A send that reached no recipient is a failure, not a send (#255): throwing lands in the
 * handler's catch, which records the cron_health failure and returns 500, so the workflow
 * run goes red and no hash is stored (the next window sends again).
 *
 * @param {Array<{status: string, error?: string}>} sendResults - From sendRoster
 */
function assertSomeoneReached(sendResults) {
  const sentCount = sendResults.filter(r => r.status === 'sent').length;
  if (sentCount === 0) {
    const why = sendResults.map(r => r.error).filter(Boolean).join('; ');
    throw new Error(`No recipient received the roster (${sendResults.length} of ${sendResults.length} sends failed)${why ? `: ${why}` : ''}`);
  }
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

/**
 * Upload the roster PNG (the bytes that are sent) to Supabase Storage.
 * Returns the storage path (e.g. 'roster-images/notify-4am/2026-04-22T11:00:00.000Z.png')
 * or null if the upload fails. Non-fatal — failures are logged and swallowed
 * so the caller can still record the message_log row with a null image_path.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Buffer} buffer    - The roster PNG
 * @param {string} jobName   - e.g. 'notify-4am', 'notify-friday-pm'
 * @param {string} jobRunAt  - ISO timestamp captured at handler entry
 * @returns {Promise<string|null>}
 */
async function storeRosterImage(supabase, buffer, jobName, jobRunAt) {
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
 * @returns {Promise<{lastHash: string, lastDate: string, lastSnapshot: Array|null, window: string|null}|null>}
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
    window: data.result.window || null,
    sentAt: data.result.sentAt || null,
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
 * @param {Array} sendResults - From sendRoster
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

/** The claim fields finishClaim needs, stamped now. */
function claimEnd(claim) {
  return { date: claim.date, trigger: claim.trigger, now: new Date() };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Auth: the on-time trigger (Vercel cron's CRON_SECRET), else the token (REQ-658) ---
  // Only the credential decides who is calling; nothing in the query can make a call the trigger.
  // Stryker disable next-line StringLiteral: any fallback no request sends works; '' plus Boolean() below fails closed
  const cronSecret = process.env.CRON_SECRET || '';
  const isTrigger = Boolean(cronSecret) && req.headers.authorization === `Bearer ${cronSecret}`;
  const expectedToken = process.env.INTERNAL_API_TOKEN || '';
  if (!isTrigger) {
    const providedToken = req.query.token || '';
    if (!expectedToken || providedToken !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // --- Input validation: window param (the trigger sends the 4am roster only) ---
  const window = req.query.window || (isTrigger ? '4am' : '');
  if (isTrigger && (window !== '4am' || req.query.date !== undefined || req.query.force !== undefined)) {
    return res.status(400).json({ error: 'The on-time trigger sends the 4am roster only, with no date or force' });
  }
  if (!VALID_WINDOWS.includes(window)) {
    return res.status(400).json({
      error: `Invalid window: "${window}". Must be one of: ${VALID_WINDOWS.join(', ')}`,
    });
  }

  // --- The automatic 4am send: gate on the Pacific hour, then claim the day (REQ-658) ---
  // Today's 4am roster from the trigger or the GitHub fallback. A date or force=1 (token only) is a
  // manual send: no gate, no claim. All of this comes before any other work, so a call that
  // mustn't send does nothing that could fail or overwrite state.
  const force = !isTrigger && req.query.force === '1';
  let claim = null; // { date, trigger, prior, clock } once this call owns today's 4am send
  if (window === '4am' && !req.query.date && !force) {
    const clock = pacificClock(new Date());
    const trigger = isTrigger ? 'vercel' : 'github';
    if (isTrigger && !onTimeWindowOpen(clock)) {
      console.log(`[Notify] On-time trigger at ${clock.weekday} ${clock.time} Pacific: outside 04:00–05:59 Mon–Fri, skipping`);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'outside_window', window });
    }
    if (!isTrigger && !isWeekday(clock)) {
      console.log(`[Notify] Fallback on a ${clock.weekday}: the 4am roster is weekdays only (force=1 sends anyway)`);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'not_a_weekday', window });
    }
    if (!isTrigger && !fallbackHourReached(clock)) {
      console.log(`[Notify] Fallback at ${clock.time} Pacific: before 06:00, leaving the 4am send to the on-time trigger`);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'before_fallback_hour', window });
    }
    try {
      const supabase = getSupabase();
      const prior = await readClaim(supabase);
      if (prior?.status === 'success' && prior.result?.date === clock.date) {
        console.log(`[Notify] 4am roster for ${clock.date} already sent (by ${prior.result.trigger}) — skipping`);
        return res.status(200).json({ ok: true, action: 'skipped', reason: 'already_sent', window, date: clock.date });
      }
      const lastState = await readLastSentState(supabase);
      if (rosterSentToday(lastState, clock)) {
        console.log(`[Notify] A roster already went out on ${clock.date} (${lastState.window ?? 'window not recorded'}) — skipping the 4am send`);
        // The fallback says the 4am send missed, unless the claim couldn't be read and the stored send
        // is the 4am one (it went out; only the claim row was unreadable).
        if (!isTrigger && !(prior?.unreadable && lastState.window === '4am')) {
          await alertAndLog(supabase, ALERT_JOB, missedAlert(clock, missReason(prior, clock.date)));
        }
        return res.status(200).json({ ok: true, action: 'skipped', reason: 'already_sent', window, date: clock.date });
      }
      if (!(await claimDay(supabase, { date: clock.date, trigger, now: new Date() }))) {
        return res.status(200).json({ ok: true, action: 'skipped', reason: 'already_claimed', window, date: clock.date });
      }
      claim = { date: clock.date, trigger, prior, clock };
    } catch (err) {
      console.error('[Notify] ❌ 4am claim error:', err.message);
      try {
        await writeCronHealth(getSupabase(), 'notify', 'failure', null, err.message.slice(0, 500), { keepResult: true });
      } catch { /* ignore — the 500 below is the signal */ }
      return res.status(500).json({ error: err.message });
    }
  }

  // --- Channel: required, checked before any work so a skipped window can't hide a bad value ---
  const { channel, error: channelError } = readRosterChannel(process.env.ROSTER_CHANNEL);
  if (channelError) {
    console.error(`[Notify] ${channelError}`);
    try {
      const supabase = getSupabase();
      if (window === 'friday-pm') {
        await writeCronHealth(supabase, 'notify-friday-pm', 'failure', null, channelError);
      } else {
        await writeCronHealth(supabase, 'notify', 'failure', null, channelError, { keepResult: true });
      }
      // Stryker disable next-line ConditionalExpression: without a claim, claimEnd(null) throws into this catch, which ignores it
      if (claim) await finishClaim(supabase, { ...claimEnd(claim), status: 'failure', outcome: 'failed', error: channelError });
    } catch { /* ignore — the 500 below is the signal */ }
    return res.status(500).json({ error: channelError });
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

      const supabase = getSupabase();
      const png = await fetchRosterPng(imageUrl);
      const fridayImagePath = await storeRosterImage(supabase, png, 'notify-friday-pm', jobRunAt);
      console.log(`[Notify] Sending weekend roster on ${channel}`);
      const sendResults = await sendRoster({ channel, png, caption: 'Weekend roster' });
      console.log(`[Notify] Storing roster image and recording message_log — job: notify-friday-pm, imagePath: ${fridayImagePath ?? 'null'}`);
      await recordMessageLog(supabase, sendResults, 'notify-friday-pm', 'image', null, fridayImagePath).catch(err =>
        console.warn(`[Notify] Failed to record message_log (friday-pm): ${err.message}`)
      );
      assertSomeoneReached(sendResults);
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
  if (claim) {
    // The claimed day: the same Pacific date the claim was made for.
    date = parseDateParam(claim.date);
  } else if (dateParam) {
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
      if (claim) {
        // A claimed 4am call that finds nothing to send is a failure Kate hears about (once a day),
        // and the day stays open for a later call.
        await finishClaim(supabase, { ...claimEnd(claim), status: 'failure', outcome: 'no_data', error: 'No roster data' });
        if (!noDataAlreadyReported(claim.prior, claim.date)) {
          await alertAndLog(supabase, ALERT_JOB, noDataAlert(claim.clock, claim.trigger));
        }
      }
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
    // The request's own host, so this works for any deployment (prod, preview, local); the on-time
    // trigger uses the production domain (below).
    // ts param passes the job run time to roster-image.js for the "as of" header line.
    // sendWindow drives badge suppression (4am has no prior send to diff against).
    // lastSnapshot (7am/8:30am only) enables the blue intra-day overlay in roster-image.js.
    // The trigger renders from the production domain: a cron's own host can be the deployment's
    // generated URL, which Vercel's Deployment Protection may answer with 401.
    const origin = isTrigger ? PROD_URL : `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
    let imageUrl = `${origin}/api/roster-image?date=${dateStr}&token=${expectedToken}&ts=${encodeURIComponent(jobRunAt)}&sendWindow=${window}`;
    if (lastSnapshot) {
      imageUrl += `&lastSnapshot=${Buffer.from(JSON.stringify(lastSnapshot)).toString('base64')}`;
    }
    console.log(`[Notify] Image URL: ${origin}/api/roster-image?date=${dateStr}&token=***&ts=${encodeURIComponent(jobRunAt)}&sendWindow=${window}${lastSnapshot ? '&lastSnapshot=<snapshot>' : ''}`);

    // --- Render once, store, send the same bytes ---
    const png = await fetchRosterPng(imageUrl);
    const imagePath = await storeRosterImage(supabase, png, `notify-${window}`, jobRunAt);
    console.log(`[Notify] Sending ${window} roster on ${channel}`);
    const sendResults = await sendRoster({ channel, png, caption: `Roster ${window}` });

    // --- Record message log (non-fatal) ---
    console.log(`[Notify] Storing roster image and recording message_log — job: notify-${window}, imagePath: ${imagePath ?? 'null'}`);
    await recordMessageLog(supabase, sendResults, `notify-${window}`, 'image', null, imagePath).catch(err =>
      console.warn(`[Notify] Failed to record message_log (${window}): ${err.message}`)
    );

    assertSomeoneReached(sendResults);

    // --- Persist state (non-fatal) ---
    await persistSentState(supabase, currentHash, dateStr, window, sendResults, data.workers);

    if (claim) {
      await finishClaim(supabase, { ...claimEnd(claim), status: 'success', outcome: 'sent' });
      if (claim.trigger === 'github') {
        // The fallback only gets here when the on-time send didn't happen: say so, and why.
        await alertAndLog(supabase, ALERT_JOB, lateSendAlert(pacificClock(new Date()), missReason(claim.prior, claim.date)));
      }
    }

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
      // keepResult: the 7am/8:30am baseline (lastHash/lastDate) survives a failed run (REQ-658).
      await writeCronHealth(supabase, 'notify', 'failure', null, err.message.slice(0, 500), { keepResult: true });
      // Stryker disable next-line ConditionalExpression: without a claim, claimEnd(null) throws into this catch, which ignores it
      if (claim) await finishClaim(supabase, { ...claimEnd(claim), status: 'failure', outcome: 'failed', error: err.message.slice(0, 500) });
    } catch { /* ignore — health write failure should not mask the original error */ }
    return res.status(500).json({ error: err.message });
  }
}
