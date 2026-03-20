/* global process */
/**
 * Notify helper functions extracted for testability.
 *
 * `refreshDaytimeSchedule` was previously inlined in api/notify.js. It is
 * extracted here so it can be unit-tested without standing up the HTTP handler.
 *
 * @requirements REQ-v5.0-M1-2
 */

import { ensureSession, clearSession } from './scraper/sessionCache.js';
import { setSession, authenticatedFetch } from './scraper/auth.js';
import { parseDaytimeSchedulePage, upsertDaytimeAppointments } from './scraper/daytimeSchedule.js';

const BASE_URL = process.env.VITE_EXTERNAL_SITE_URL || 'https://agirlandyourdog.com';

/**
 * Refresh today's daytime schedule data from the external site before building
 * the image. This ensures the 7am and 8:30am sends reflect actual changes made
 * after the midnight cron ran, making the hash-change gate meaningful.
 *
 * Strategy: mirrors the fetch + parse + upsert pattern from cron-schedule.js
 * scoped to just the current day with no side effects on boarding sync state.
 *
 * Error-handling: ALL errors are caught internally — this is a best-effort
 * pre-flight. A missing session, failed fetch, or upsert error logs a warning
 * and returns { refreshed: false } so the caller continues with stale DB data.
 * The send must never be blocked by a refresh failure.
 *
 * Exit paths:
 *   1. ensureSession throws             → { refreshed: false, warning: 'Session unavailable: ...' }
 *   2. authenticatedFetch throws SESSION_EXPIRED → clears session → { refreshed: false, warning: '...' }
 *   3. authenticatedFetch throws (other) → { refreshed: false, warning: 'Schedule fetch failed: ...' }
 *   4. rows.length === 0 + large HTML   → { refreshed: true, rowCount: 0, warning: '...access-denied...' }
 *   5. rows.length === 0 + small HTML   → { refreshed: true, rowCount: 0, warning: '...small/empty...' }
 *   6. Upsert has errors               → { refreshed: true, rowCount: N, warning: null }
 *   7. Unexpected error (outer catch)   → { refreshed: false, warning: 'Unexpected refresh error: ...' }
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Date} date - Local Date for the day being notified (usually today)
 * @returns {Promise<{ refreshed: boolean, rowCount: number, warning: string|null }>}
 */
export async function refreshDaytimeSchedule(supabase, date) {
  // Outer try/catch ensures this function NEVER throws — every exit path returns
  // { refreshed: boolean, rowCount: number, warning: string|null }.
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
      // SESSION_EXPIRED: clear the cached session so cron-auth re-authenticates.
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

    const rows = parseDaytimeSchedulePage(html);
    console.log(`[Notify/Refresh] Parsed ${rows.length} daytime events`);

    let parseWarning = null;
    if (rows.length === 0) {
      const sizeNote = html.length > 10000 ? 'possible access-denied redirect' : 'small/empty response';
      console.warn(`[Notify/Refresh] 0 events parsed from ${html.length}-byte response — ${sizeNote}`);
      if (html.length > 10000) {
        console.warn(`[Notify/Refresh] HTML preview: ${html.slice(0, 150).replace(/\s+/g, ' ')}`);
      }
      parseWarning = `Schedule fetched (${html.length} bytes) but 0 daytime events parsed — ${sizeNote}`;
    }

    const { upserted, errors } = await upsertDaytimeAppointments(supabase, rows);
    if (errors > 0) {
      console.warn(`[Notify/Refresh] Upsert completed with ${errors} error(s) — ${upserted} rows written`);
    } else {
      console.log(`[Notify/Refresh] Upserted ${upserted} rows`);
    }

    return { refreshed: true, rowCount: upserted, warning: parseWarning };

  } catch (err) {
    console.warn(`[Notify/Refresh] Unexpected error: ${err.message} — continuing with stale DB data`);
    return { refreshed: false, rowCount: 0, warning: `Unexpected refresh error: ${err.message}` };
  }
}
