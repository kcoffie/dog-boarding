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
 *   - NON_BOARDING_RE is NOT exported for use by integration-check.js.
 *     integration-check.js defines its own copy independently to preserve
 *     signal isolation. See integration-check.js comment for rationale.
 *
 * SIDE EFFECT — setSession:
 *   runScheduleSync calls setSession(cookies) on the auth module, which sets
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
import { authenticatedFetch } from './auth.js';
import { ensureSession, clearSession } from './sessionCache.js';
import { enqueue, dequeueOne, markDone, markFailed, resetStuck as resetStuckItems, getQueueDepth } from './syncQueue.js';
import { parseDaytimeSchedulePage, upsertDaytimeAppointments } from './daytimeSchedule.js';
import { fetchAppointmentDetails } from './extraction.js';
import { mapAndSaveAppointment } from './mapping.js';
import { fetchAndStoreBoardingForm } from './forms.js';

const BASE_URL = process.env.VITE_EXTERNAL_SITE_URL || 'https://agirlandyourdog.com';
const CURSOR_WINDOW_WEEKS = 8;

// Known non-boarding title patterns — mirrors sync.js pre-filter.
// NOT exported — integration-check.js defines its own copy for signal isolation.
const NON_BOARDING_RE = [
  /(d\/c|\bdc\b)/i,
  /(p\/g|g\/p|\bpg\b)/i,
  /\badd\b/i,
  /switch\s+day/i,
  /back\s+to\s+\d+/i,
  /initial\s+eval/i,
  /^busy$/i,
];

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
  const { data } = await supabase
    .from('sync_settings')
    .select('schedule_cursor_date')
    .limit(1)
    .single();

  if (data?.schedule_cursor_date) {
    const [y, mo, d] = data.schedule_cursor_date.split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  return new Date();
}

/**
 * Persist the cursor date in sync_settings.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Date} date
 */
async function saveCursorDate(supabase, date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const isoDate = `${y}-${m}-${d}`;

  const { data: existing } = await supabase
    .from('sync_settings')
    .select('id')
    .limit(1)
    .single();

  if (existing) {
    await supabase
      .from('sync_settings')
      .update({ schedule_cursor_date: isoDate })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('sync_settings')
      .insert({ schedule_cursor_date: isoDate });
  }
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
 *   Must use the service role key — reads session_cookies from sync_settings.
 * @returns {Promise<{
 *   action: 'ok'|'session_failed'|'session_cleared',
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

  // Ensure we have a valid session — re-authenticates if cache is missing/expired.
  // Requires EXTERNAL_SITE_USERNAME + EXTERNAL_SITE_PASSWORD in env when re-auth is needed.
  let cookies;
  try {
    cookies = await ensureSession(supabase);
  } catch (sessionErr) {
    console.error('[SyncRunner:Schedule] ❌ Could not obtain session:', sessionErr.message);
    return { action: 'session_failed', error: sessionErr.message, pagesScanned: 0, found: 0, skipped: 0, queued: 0, daytimeUpserted: 0, daytimeErrors: 0, cursorAdvancedTo: '', queueDepth: 0 };
  }

  // Sets module-level state in auth.js used by authenticatedFetch (intentional — see module JSDoc).
  setSession(cookies);

  const cursorDate = await getCursorDate(supabase);
  const today = new Date();
  console.log(`[SyncRunner:Schedule] 📅 Cursor: ${cursorDate.toDateString()}`);

  const stats = { pagesScanned: 0, found: 0, skipped: 0, queued: 0, daytimeUpserted: 0, daytimeErrors: 0 };

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
        await clearSession(supabase);
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

  for (const appt of appointments) {
    const titleLower = (appt.title || '').toLowerCase().trim();
    const matchedPattern = NON_BOARDING_RE.find(re => re.test(titleLower));

    if (matchedPattern) {
      console.log(`[SyncRunner:Schedule] ⏭️ SKIP ${appt.id} — matched NON_BOARDING_RE ${matchedPattern}`);
      stats.skipped++;
      continue;
    }

    console.log(`[SyncRunner:Schedule] 📥 ENQUEUE ${appt.id} title="${appt.title}"`);
    try {
      await enqueue(supabase, {
        external_id: appt.id,
        source_url: appt.url,
        title: appt.title || appt.petName || '',
        meta: appt.petIds?.[0] ? { external_pet_id: appt.petIds[0] } : {},
      });
      stats.queued++;
    } catch (err) {
      console.error(`[SyncRunner:Schedule] ⚠️ Enqueue failed for ${appt.id}: ${err.message}`);
    }
  }

  console.log(`[SyncRunner:Schedule] 🐕 ${stats.found} found, ${stats.skipped} skipped, ${stats.queued} queued`);

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

  return {
    action: 'ok',
    pagesScanned: stats.pagesScanned,
    found: stats.found,
    skipped: stats.skipped,
    queued: stats.queued,
    daytimeUpserted: stats.daytimeUpserted,
    daytimeErrors: stats.daytimeErrors,
    cursorAdvancedTo: nextCursor.toISOString().slice(0, 10),
    queueDepth,
  };
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
 *   action: 'idle'|'created'|'updated'|'unchanged'|'form_stored'|'skipped'|'failed'|'form_failed'|'save_failed'|'session_failed'|'session_cleared',
 *   externalId?: string,
 *   queueDepth?: number,
 *   error?: string,
 *   reason?: string,
 * }>}
 */
export async function runDetailSync(supabase, { runResetStuck = true } = {}) {
  // Ensure session before dequeuing so we never need to put an item back on auth failure.
  let cookies;
  try {
    cookies = await ensureSession(supabase);
  } catch (sessionErr) {
    console.error('[SyncRunner:Detail] ❌ Could not obtain session:', sessionErr.message);
    return { action: 'session_failed', error: sessionErr.message };
  }

  setSession(cookies);

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
      if (formErr.message && formErr.message.includes('Session expired')) {
        console.log('[SyncRunner:Detail] 🔒 SESSION_EXPIRED during form fetch — clearing session + re-queuing item');
        await clearSession(supabase);
        await supabase
          .from('sync_queue')
          .update({ status: 'pending', processing_started_at: null })
          .eq('id', item.id);
        return { action: 'session_cleared', reason: 'session_expired' };
      }
      const msg = formErr.message.slice(0, 200);
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
    if (err.message && err.message.includes('Session expired')) {
      console.log('[SyncRunner:Detail] 🔒 SESSION_EXPIRED during detail fetch — clearing session + re-queuing item');
      await clearSession(supabase);
      await supabase
        .from('sync_queue')
        .update({ status: 'pending', processing_started_at: null })
        .eq('id', item.id);
      return { action: 'session_cleared', reason: 'session_expired' };
    }
    const msg = err.message.slice(0, 200);
    console.error(`[SyncRunner:Detail] ❌ Fetch failed (retry ${(item.retry_count || 0) + 1}/3): ${msg}`);
    await markFailed(supabase, item.id, msg);
    const remaining = await getQueueDepth(supabase);
    return { action: 'failed', error: msg, externalId: item.external_id, queueDepth: remaining };
  }

  if (!details.pet_name && item.title) details.pet_name = item.title;

  try {
    const saveResult = await mapAndSaveAppointment(details, { supabase, externalPetId });
    await markDone(supabase, item.id);

    const { stats } = saveResult;
    const action = stats.syncCreated ? 'created'
      : stats.syncUpdated || stats.dogUpdated || stats.boardingUpdated ? 'updated'
      : 'unchanged';

    const remaining = await getQueueDepth(supabase);
    console.log(`[SyncRunner:Detail] ✅ ${details.pet_name || details.external_id} → ${action} — queue depth: ${remaining}`);
    return { action, externalId: item.external_id, queueDepth: remaining };
  } catch (saveErr) {
    const msg = saveErr.message.slice(0, 200);
    console.error(`[SyncRunner:Detail] ❌ Save failed (retry ${(item.retry_count || 0) + 1}/3): ${msg}`);
    await markFailed(supabase, item.id, msg);
    const remaining = await getQueueDepth(supabase);
    return { action: 'save_failed', error: msg, externalId: item.external_id, queueDepth: remaining };
  }
}
