/**
 * syncRunner — shared schedule-scan and detail-processing logic.
 *
 * This module extracts the core sync operations from the Vercel cron handler
 * wrappers so they can be called from multiple entry points:
 *   - api/cron-schedule.js  — Vercel cron (thin wrapper)
 *   - api/cron-detail.js    — Vercel cron (thin wrapper)
 *   - scripts/integration-check.js — Step 0 sync-before-compare
 *
 * DESIGN RULES (do not violate):
 *   - Both runners accept `supabase` as a parameter. They never instantiate
 *     their own client. The caller controls the key scope (must be service role).
 *   - Neither runner calls writeCronHealth. Health tracking is the Vercel
 *     handler's responsibility. Calling it from integration-check would
 *     overwrite the midnight cron's health record.
 *   - Non-boarding title patterns come from SCRAPER_CONFIG.nonBoardingPatterns
 *     (config.js). integration-check.js imports the same constant so all
 *     execution paths use a single definition.
 *
 * SESSION (#324): both runners read the stored session with getSiteSession and never log in.
 *   While the breaker is tripped they return action 'site_blocked' before touching the site or
 *   the queue; with no session they return 'session_failed'.
 *
 * SIDE EFFECT — setSession:
 *   runScheduleSync calls setSession(cookies, { supabase }) on the auth module, which sets
 *   module-level state used by authenticatedFetch. This is intentional and safe
 *   in a single-process Node.js context (no concurrency). Be aware that any
 *   subsequent authenticatedFetch calls in the same process will use these
 *   cookies. In Vercel serverless each invocation is isolated, so no conflict.
 *
 * CURSOR ADVANCE SIDE EFFECT:
 *   runScheduleSync advances schedule_cursor_date in sync_settings every call.
 *   When called from the integration check (3×/day), the cursor advances 3
 *   extra times beyond the midnight cron. The cursor cycles over 8 weeks so
 *   this is functionally harmless, but the cursor no longer cleanly represents
 *   "how far the midnight cron has advanced." Acceptable tradeoff.
 *
 * ENQUEUE IDEMPOTENCY:
 *   enqueue() silently skips items already pending, processing, or done.
 *   It is safe to call runScheduleSync on a schedule that was already scanned
 *   tonight — duplicate external_ids will be skipped without error.
 *
 * @requirements REQ-109
 */

import { setSession } from './auth.js';
import { authenticatedFetch, SiteThrottled } from './auth.js';
import { getSiteSession, clearSiteSession } from './siteAccess.js';
import { SCRAPER_CONFIG } from './config.js';
import { applyDetailFilters } from './appointmentFilter.js';
import { readSettingsRow } from './syncSettingsRow.js';
import { enqueue, dequeueOne, markDone, markFailed, resetStuck as resetStuckItems, getQueueDepth } from './syncQueue.js';
import { parseDaytimeSchedulePage, upsertDaytimeAppointments } from './daytimeSchedule.js';
import { fetchAppointmentDetails } from './extraction.js';
import { mapAndSaveAppointment } from './mapping.js';
import { fetchAndStoreBoardingForm } from './forms.js';
import { DetailRedirected } from './redirects.js';
import { alertAndLog } from '../alertKate.js';

const BASE_URL = process.env.VITE_EXTERNAL_SITE_URL || 'https://agirlandyourdog.com';
const CURSOR_WINDOW_WEEKS = 8;

// ---------------------------------------------------------------------------
// Schedule helpers (previously private in cron-schedule.js)
// ---------------------------------------------------------------------------

/**
 * Build the schedule URL for a specific week start date.
 * /schedule/days-7/YYYY/M/D
 *
 * @param {Date} date
 * @returns {string}
 */
export function buildWeekUrl(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${BASE_URL}/schedule/days-7/${y}/${m}/${d}`;
}

/**
 * Advance the cursor by 7 days.
 * Wraps back to today when the cursor would exceed today + CURSOR_WINDOW_WEEKS weeks.
 *
 * @param {Date} cursor
 * @returns {Date}
 */
export function advanceCursor(cursor) {
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + CURSOR_WINDOW_WEEKS * 7);

  const next = new Date(cursor);
  next.setDate(next.getDate() + 7);

  return next > maxDate ? new Date() : next;
}

/**
 * Fetch one schedule page and return its raw HTML.
 * Throws with message 'SESSION_EXPIRED' if the site serves a login page.
 *
 * @param {Date} date
 * @returns {Promise<string>}
 */
async function fetchScheduleHtml(date) {
  const url = buildWeekUrl(date);
  console.log(`[SyncRunner:Schedule] Fetching ${date.toDateString()} — url: ${url}`);
  const response = await authenticatedFetch(url);
  if (!response.ok) throw new Error(`Schedule fetch failed: ${response.status}`);
  const html = await response.text();
  if (html.includes('login') && html.includes('password')) {
    throw new Error('SESSION_EXPIRED');
  }
  return html;
}

/**
 * Extract appointment links from schedule page HTML using regex.
 * No DOMParser required — safe for Node.js runtime.
 *
 * Returns objects with: { id, url, timestamp, petName, clientName, time, title, petIds }
 *
 * @param {string} html
 * @returns {Array<Object>}
 */
export function parseScheduleHtml(html) {
  const results = [];
  const seen = new Set();

  const blockRe = /<a\b([^>]+href="[^"]*\/schedule\/a\/[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = blockRe.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];

    const hrefMatch = attrs.match(/href="([^"]+)"/);
    if (!hrefMatch) continue;

    const href = hrefMatch[1];
    const urlMatch = href.match(/\/schedule\/a\/([^/]+)\/(\d+)/);
    if (!urlMatch) continue;

    const id = urlMatch[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const pick = (cls) => {
      const r = inner.match(new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([^<]*)<`));
      return r ? r[1].trim() : '';
    };

    const petIds = [];
    const petIdRe = /data-pet="([^"]+)"/g;
    let petMatch;
    while ((petMatch = petIdRe.exec(inner)) !== null) {
      petIds.push(petMatch[1]);
    }

    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    results.push({
      id,
      url: fullUrl,
      timestamp: urlMatch[2],
      petName: pick('event-pet'),
      clientName: pick('event-client'),
      time: pick('day-event-time'),
      title: pick('day-event-title'),
      petIds,
    });
  }

  return results;
}

/**
 * Read the current cursor date from sync_settings.
 * Returns today if not set.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Date>}
 */
async function getCursorDate(supabase) {
  const data = await readSettingsRow(supabase, 'schedule_cursor_date');
  if (data?.schedule_cursor_date) {
    const [y, mo, d] = data.schedule_cursor_date.split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  return new Date();
}

/**
 * A local calendar date as YYYY-MM-DD (the cursor is a local date, not a UTC instant).
 *
 * @param {Date} date
 * @returns {string}
 */
function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * An error's text for the queue, first 200 characters. A thrown non-Error (a string,
 * a Supabase error object) still yields text, so the item is marked failed, not left stuck.
 *
 * @param {unknown} err
 * @returns {string}
 */
function errorText(err) {
  return String(err?.message ?? err).slice(0, 200);
}

/**
 * Persist the cursor date in sync_settings.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Date} date
 */
async function saveCursorDate(supabase, date) {
  const isoDate = toLocalIsoDate(date);
  const existing = await readSettingsRow(supabase, 'id');

  const { error } = existing
    ? await supabase.from('sync_settings').update({ schedule_cursor_date: isoDate }).eq('id', existing.id)
    : await supabase.from('sync_settings').insert({ schedule_cursor_date: isoDate });
  if (error) throw new Error(`sync_settings cursor write failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Exported runners
// ---------------------------------------------------------------------------

/**
 * Scan schedule pages, enqueue boarding candidates, and upsert daytime events.
 *
 * Fetches three pages per call (current week, next week, cursor week) and
 * advances the rotating cursor. Handles SESSION_EXPIRED by clearing the
 * cached session and returning early with action='session_cleared'.
 *
 * Does NOT call writeCronHealth — callers are responsible for health tracking.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 *   Must use the service role key — reads the session from site_access.
 * @returns {Promise<{
 *   action: 'ok'|'enqueue_failed'|'session_failed'|'session_cleared'|'site_blocked',
 *   reason?: string, failedEnqueues?: number, failedEnqueueIds?: string[],
 *   pagesScanned: number,
 *   found: number,
 *   skipped: number,
 *   queued: number,
 *   daytimeUpserted: number,
 *   daytimeErrors: number,
 *   cursorAdvancedTo: string,
 *   queueDepth: number,
 *   error?: string,
 * }>}
 */
export async function runScheduleSync(supabase) {
  console.log('[SyncRunner:Schedule] Starting schedule sync');

  let cookies;
  try {
    cookies = await getSiteSession(supabase);
  } catch (sessionErr) {
    const empty = { pagesScanned: 0, found: 0, skipped: 0, queued: 0, daytimeUpserted: 0, daytimeErrors: 0, cursorAdvancedTo: '', queueDepth: 0 };
    if (sessionErr.code === 'SITE_BLOCKED') {
      console.log('[SyncRunner:Schedule] ⛔ Booking site blocked: not scanning');
      return { action: 'site_blocked', ...empty };
    }
    console.error('[SyncRunner:Schedule] ❌ Could not obtain session:', sessionErr.message);
    return { action: 'session_failed', error: sessionErr.message, ...empty };
  }

  // Sets module-level state in auth.js used by authenticatedFetch (intentional — see module JSDoc).
  setSession(cookies, { supabase });

  const cursorDate = await getCursorDate(supabase);
  const today = new Date();
  console.log(`[SyncRunner:Schedule] 📅 Cursor: ${cursorDate.toDateString()}`);

  const stats = { pagesScanned: 0, found: 0, skipped: 0, queued: 0, requeuedEdited: 0, urlChangesIgnored: 0, daytimeUpserted: 0, daytimeErrors: 0 };
  const failedEnqueueIds = [];

  const datesToFetch = [today];
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  datesToFetch.push(nextWeek);

  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const sameAsToday    = Math.abs(cursorDate - today)    < ONE_WEEK_MS;
  const sameAsNextWeek = Math.abs(cursorDate - nextWeek) < ONE_WEEK_MS;
  if (!sameAsToday && !sameAsNextWeek) datesToFetch.push(cursorDate);

  const seenIds = new Set();
  const appointments = [];
  const allDaytimeAppts = [];

  for (const date of datesToFetch) {
    let html;
    try {
      html = await fetchScheduleHtml(date);
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') {
        console.log('[SyncRunner:Schedule] 🔒 SESSION_EXPIRED detected — clearing cached session');
        await clearSiteSession(supabase);
        return { action: 'session_cleared', reason: 'session_expired', pagesScanned: stats.pagesScanned, found: 0, skipped: 0, queued: 0, daytimeUpserted: 0, daytimeErrors: 0, cursorAdvancedTo: '', queueDepth: 0 };
      }
      throw err;
    }

    const parsed = parseScheduleHtml(html);
    stats.pagesScanned++;
    console.log(`[SyncRunner:Schedule] 📋 ${parsed.length} appointments on ${date.toDateString()}`);

    for (const appt of parsed) {
      if (seenIds.has(appt.id)) continue;
      seenIds.add(appt.id);
      appointments.push(appt);
    }

    const daytimeAppts = parseDaytimeSchedulePage(html);
    console.log(`[SyncRunner:Schedule] 🏃 ${daytimeAppts.length} daytime events on ${date.toDateString()}`);
    allDaytimeAppts.push(...daytimeAppts);
  }

  stats.found = appointments.length;
  // An empty schedule across every page is a broken page or a layout change, never a real
  // week: fail the run before queueing, the daytime upsert or the cursor (#324)
  if (stats.found === 0) {
    throw new Error(`The schedule showed 0 appointments across ${stats.pagesScanned} page(s)`);
  }

  for (const appt of appointments) {
    const titleLower = (appt.title || '').toLowerCase().trim();
    const matchedPattern = SCRAPER_CONFIG.nonBoardingPatterns.find(re => re.test(titleLower));

    if (matchedPattern) {
      console.log(`[SyncRunner:Schedule] ⏭️ SKIP ${appt.id} title="${appt.title}" — matched nonBoardingPatterns ${matchedPattern}`);
      stats.skipped++;
      continue;
    }

    console.log(`[SyncRunner:Schedule] 📥 ENQUEUE ${appt.id} title="${appt.title}"`);
    try {
      const outcome = await enqueue(supabase, {
        external_id: appt.id,
        source_url: appt.url,
        title: appt.title || appt.petName || '',
        meta: appt.petIds?.[0] ? { external_pet_id: appt.petIds[0] } : {},
      });
      stats.queued++;
      if (outcome === 'requeued_edited') stats.requeuedEdited++;
      if (outcome === 'url_change_ignored') stats.urlChangesIgnored++;
    } catch (err) {
      console.error(`[SyncRunner:Schedule] ⚠️ Enqueue failed for ${appt.id}: ${err.message}`);
      failedEnqueueIds.push(appt.id);
    }
  }

  console.log(`[SyncRunner:Schedule] 🐕 ${stats.found} found, ${stats.skipped} skipped, ${stats.queued} queued (${stats.requeuedEdited} re-queued as edited, ${stats.urlChangesIgnored} URL changes ignored on skipped items)`);

  const daytimeResult = await upsertDaytimeAppointments(supabase, allDaytimeAppts);
  stats.daytimeUpserted = daytimeResult.upserted;
  stats.daytimeErrors = daytimeResult.errors;
  console.log(`[SyncRunner:Schedule] 📊 Daytime upserted: ${daytimeResult.upserted}, errors: ${daytimeResult.errors}`);

  const nextCursor = advanceCursor(cursorDate);
  await saveCursorDate(supabase, nextCursor);
  const wrapped = nextCursor <= today;
  console.log(wrapped
    ? '[SyncRunner:Schedule] 🔄 Cursor wrapped back to today'
    : `[SyncRunner:Schedule] ➡️ Cursor: ${cursorDate.toDateString()} → ${nextCursor.toDateString()}`
  );

  const queueDepth = await getQueueDepth(supabase);
  console.log(`[SyncRunner:Schedule] 📊 Queue depth after scan: ${queueDepth} pending`);

  // A failed enqueue makes the run red (#275), but the cursor still moves: the cursor cycles in
  // about 2 days at 4 scans a day, and one item that always fails mustn't freeze it.
  const failed = failedEnqueueIds.length > 0
    ? { failedEnqueues: failedEnqueueIds.length, failedEnqueueIds: failedEnqueueIds.slice(0, 5) }
    : {};
  return {
    action: failedEnqueueIds.length > 0 ? 'enqueue_failed' : 'ok',
    ...failed,
    pagesScanned: stats.pagesScanned,
    found: stats.found,
    skipped: stats.skipped,
    queued: stats.queued,
    requeuedEdited: stats.requeuedEdited,
    urlChangesIgnored: stats.urlChangesIgnored,
    daytimeUpserted: stats.daytimeUpserted,
    daytimeErrors: stats.daytimeErrors,
    cursorAdvancedTo: toLocalIsoDate(nextCursor),
    queueDepth,
  };
}

// A 429/403 isn't the item's fault: put it back without using a retry, then stop (#324)
async function requeueAndStop(supabase, item, err) {
  console.log(`[SyncRunner:Detail] 🛑 ${err.message} — re-queuing ${item.external_id}`);
  await supabase
    .from('sync_queue')
    .update({ status: 'pending', processing_started_at: null })
    .eq('id', item.id);
  throw err;
}

/** The job name on alerts about booking pages the detail step couldn't read (ops-watch ALERT_JOBS). */
export const DETAIL_ALERT_JOB = 'sync-detail';

/**
 * One alert per run for the booking pages the detail step couldn't read (#344; Kate: one summary per
 * run). Each caller passes the `notice` of every runDetailSync call it made.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<string|null|undefined>} notices
 * @returns {Promise<boolean|null>} null when there was nothing to send
 */
export async function alertDetailNotices(supabase, notices) {
  const lines = notices.filter(Boolean);
  if (lines.length === 0) return null;
  return alertAndLog(supabase, DETAIL_ALERT_JOB,
    `⚠️ Q Boarding sync: ${lines.length} booking page(s) not read\n• ${lines.join('\n• ')}`);
}

// Whether this booking last held a real stay: a boarding under its ID, or dates on its sync row.
// When that can't be read, assume it did, so Kate hears about it rather than nothing.
async function heldAStay(supabase, externalId) {
  try {
    const [boardings, syncRow] = await Promise.all([
      supabase.from('boardings').select('id').eq('external_id', externalId).limit(1),
      supabase.from('sync_appointments').select('check_in_datetime').eq('external_id', externalId).maybeSingle(),
    ]);
    // Stryker disable next-line ConditionalExpression: on an error Supabase's data is null, so .length throws into the same catch
    if (boardings.error) throw boardings.error;
    if (syncRow.error) throw syncRow.error;
    return boardings.data.length > 0 || Boolean(syncRow.data?.check_in_datetime);
  } catch (err) {
    console.error(`[SyncRunner:Detail] ⚠️ Couldn't check whether ${externalId} held a stay: ${errorText(err)}`);
    return true;
  }
}

// A booking page that redirected: nothing is written (#344). The item is marked `detail_redirect`, not
// `detail_skip`, because syncQueue ignores URL changes on skipped items and an edited stay's new URL
// must still be read. Kate hears once per URL about a stay that can't be read or an unknown target.
async function finishRedirected(supabase, item, err) {
  const action = err.kind === 'schedule' ? 'redirected_to_schedule' : 'redirected_elsewhere';
  console.log(`[SyncRunner:Detail] ↪️ ${item.external_id}: ${err.message}, nothing written`);
  const title = item.title || '';
  let notice = null;
  if (item.meta?.detail_redirect?.url !== item.source_url) {
    if (err.kind !== 'schedule') {
      notice = `${item.external_id} "${title}": its page redirected to ${err.location || 'nowhere'}, so it wasn't read.`;
    } else if (await heldAStay(supabase, item.external_id)) {
      notice = `${item.external_id} "${title}": its page now redirects to the schedule (stay moved or cancelled?), so it can't be read. Its boarding is unchanged until checked.`;
    }
  }
  const meta = { ...(item.meta || {}), detail_redirect: { kind: err.kind, url: item.source_url } };
  delete meta.detail_skip;
  await markDone(supabase, item.id, { meta });
  const queueDepth = await getQueueDepth(supabase);
  return { action, externalId: item.external_id, queueDepth, notice };
}

// A page without check-in/check-out isn't a booking page; the site's layout may have changed. Nothing
// was written (#344). No `detail_skip`, so a URL change still re-queues it. Kate hears once per URL.
async function finishDateless(supabase, item) {
  console.warn(`[SyncRunner:Detail] ⛔ ${item.external_id}: no dates on the page, nothing written`);
  const notice = item.meta?.detail_dateless === item.source_url ? null
    : `${item.external_id} "${item.title || ''}": its page had no check-in/check-out dates, so nothing was saved. The booking site's page layout may have changed.`;
  const meta = { ...(item.meta || {}), detail_dateless: item.source_url };
  delete meta.detail_skip;
  await markDone(supabase, item.id, { meta });
  const queueDepth = await getQueueDepth(supabase);
  return { action: 'dateless_page', externalId: item.external_id, queueDepth, notice };
}

/**
 * Dequeue and process one item from the sync queue.
 *
 * Handles both appointment jobs and form jobs. Returns the action taken so
 * callers can loop until action === 'idle' to drain the queue.
 *
 * Does NOT call writeCronHealth — callers are responsible for health tracking.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 *   Must use the service role key.
 * @param {{ runResetStuck?: boolean }} [options]
 *   runResetStuck (default true): whether to reset stuck 'processing' items
 *   before dequeuing. Pass false when looping to avoid redundant DB queries
 *   on every iteration — the caller should call resetStuck once before the loop.
 * @returns {Promise<{
 *   action: 'idle'|'created'|'updated'|'unchanged'|'form_stored'|'skipped'|'failed'|'form_failed'|'save_failed'|'session_failed'|'session_cleared'|'site_blocked',
 *   externalId?: string,
 *   queueDepth?: number,
 *   error?: string,
 *   reason?: string,
 * }>}
 */
export async function runDetailSync(supabase, { runResetStuck = true } = {}) {
  // Get the session before dequeuing so we never need to put an item back on auth failure.
  let cookies;
  try {
    cookies = await getSiteSession(supabase);
  } catch (sessionErr) {
    if (sessionErr.code === 'SITE_BLOCKED') {
      console.log('[SyncRunner:Detail] ⛔ Booking site blocked: not dequeuing');
      return { action: 'site_blocked' };
    }
    console.error('[SyncRunner:Detail] ❌ Could not obtain session:', sessionErr.message);
    return { action: 'session_failed', error: sessionErr.message };
  }

  setSession(cookies, { supabase });

  // Reset stuck items — only needed on the first call in a loop, not every iteration.
  if (runResetStuck) {
    const resetCount = await resetStuckItems(supabase);
    if (resetCount > 0) {
      console.log(`[SyncRunner:Detail] ⚠️ Reset ${resetCount} stuck item(s) to pending`);
    }
  }

  const item = await dequeueOne(supabase);
  if (!item) {
    console.log('[SyncRunner:Detail] 📭 Queue empty — idle');
    return { action: 'idle' };
  }

  const itemType = item.type || 'appointment';
  const depth = await getQueueDepth(supabase);
  console.log(`[SyncRunner:Detail] 🐕 Processing 1 of ${depth + 1} queued: ${item.external_id} (type=${itemType}, retry=${item.retry_count ?? 0}/3)`);
  console.log(`[SyncRunner:Detail]    source_url: ${item.source_url}`);

  // ── Form fetch job ────────────────────────────────────────────────────────
  if (itemType === 'form') {
    const { boarding_id: boardingId, external_pet_id: externalPetId } = item.meta || {};

    if (!externalPetId) {
      console.log(`[SyncRunner:Detail] ⏭️ SKIP form ${item.external_id} — no external_pet_id (pre-v3 queue item)`);
      await markDone(supabase, item.id);
      const remaining = await getQueueDepth(supabase);
      return { action: 'skipped', reason: 'no_pet_id', externalId: item.external_id, queueDepth: remaining };
    }

    console.log(`[SyncRunner:Detail] 📋 Form job: boarding_id=${boardingId}, pet_id=${externalPetId}`);

    try {
      await fetchAndStoreBoardingForm(supabase, boardingId, externalPetId, item.title || '');
      await markDone(supabase, item.id);
      const remaining = await getQueueDepth(supabase);
      console.log(`[SyncRunner:Detail] ✅ Form stored for boarding ${boardingId} — queue depth: ${remaining}`);
      return { action: 'form_stored', externalId: item.external_id, queueDepth: remaining };
    } catch (formErr) {
      if (formErr instanceof SiteThrottled) await requeueAndStop(supabase, item, formErr);
      if (formErr?.message && formErr.message.includes('Session expired')) {
        console.log('[SyncRunner:Detail] 🔒 SESSION_EXPIRED during form fetch — clearing session + re-queuing item');
        await clearSiteSession(supabase);
        await supabase
          .from('sync_queue')
          .update({ status: 'pending', processing_started_at: null })
          .eq('id', item.id);
        return { action: 'session_cleared', reason: 'session_expired' };
      }
      const msg = errorText(formErr);
      console.error(`[SyncRunner:Detail] ❌ Form fetch failed (retry ${(item.retry_count || 0) + 1}/3): ${msg}`);
      await markFailed(supabase, item.id, msg);
      const remaining = await getQueueDepth(supabase);
      return { action: 'form_failed', error: msg, externalId: item.external_id, queueDepth: remaining };
    }
  }

  // ── Appointment job (default) ─────────────────────────────────────────────
  const urlMatch = item.source_url.match(/\/schedule\/a\/([^/]+)\/(\d+)/);
  const [, appointmentId, timestamp] = urlMatch || [null, item.external_id, ''];
  const externalPetId = item.meta?.external_pet_id || null;

  let details;
  try {
    details = await fetchAppointmentDetails(appointmentId, timestamp);
  } catch (err) {
    if (err instanceof SiteThrottled) await requeueAndStop(supabase, item, err);
    if (err instanceof DetailRedirected) return finishRedirected(supabase, item, err);
    if (err?.message && err.message.includes('Session expired')) {
      console.log('[SyncRunner:Detail] 🔒 SESSION_EXPIRED during detail fetch — clearing session + re-queuing item');
      await clearSiteSession(supabase);
      await supabase
        .from('sync_queue')
        .update({ status: 'pending', processing_started_at: null })
        .eq('id', item.id);
      return { action: 'session_cleared', reason: 'session_expired' };
    }
    const msg = errorText(err);
    console.error(`[SyncRunner:Detail] ❌ Fetch failed (retry ${(item.retry_count || 0) + 1}/3): ${msg}`);
    await markFailed(supabase, item.id, msg);
    const remaining = await getQueueDepth(supabase);
    return { action: 'failed', error: msg, externalId: item.external_id, queueDepth: remaining };
  }

  if (!details.pet_name && item.title) details.pet_name = item.title;

  // Post-detail filters — same logic as the browser sync path (sync.js).
  // Cron path is always boardingOnly; no date-range window (cursor handles scope).
  const { skip: shouldSkip, reason: skipReason } = applyDetailFilters(details, item.title);
  if (shouldSkip) {
    console.log(`[SyncRunner:Detail] ⏭️ SKIP ${item.external_id} — ${skipReason}`);
    // Recorded so later URL changes on this item aren't taken as edits (#278, syncQueue.enqueue)
    await markDone(supabase, item.id, { meta: { ...(item.meta || {}), detail_skip: skipReason } });
    const remaining = await getQueueDepth(supabase);
    return { action: 'skipped', reason: skipReason, externalId: item.external_id, queueDepth: remaining };
  }

  try {
    const saveResult = await mapAndSaveAppointment(details, { supabase, externalPetId });
    if (saveResult.skipped === 'dateless_page') return finishDateless(supabase, item);
    await markDone(supabase, item.id);

    const { stats } = saveResult;
    const action = stats.syncCreated ? 'created'
      : stats.syncUpdated || stats.dogUpdated || stats.boardingUpdated ? 'updated'
      : 'unchanged';

    const remaining = await getQueueDepth(supabase);
    console.log(`[SyncRunner:Detail] ✅ ${details.pet_name || details.external_id} → ${action} — queue depth: ${remaining}`);
    return { action, externalId: item.external_id, queueDepth: remaining };
  } catch (saveErr) {
    const msg = errorText(saveErr);
    console.error(`[SyncRunner:Detail] ❌ Save failed (retry ${(item.retry_count || 0) + 1}/3): ${msg}`);
    await markFailed(supabase, item.id, msg);
    const remaining = await getQueueDepth(supabase);
    return { action: 'save_failed', error: msg, externalId: item.external_id, queueDepth: remaining };
  }
}
