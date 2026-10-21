/**
 * Booking-site access (#324 part B): the stored session and the breaker, in the one-row
 * `site_access` table (service key only; migration 028).
 *
 * - getSiteSession() is the one way a run gets the session. It never logs in, and it fails
 *   closed: a blocked breaker, no session, or a failed read all throw.
 * - tripBreaker() is called on a lockout risk only: a rejected login, or a 429/403. The first
 *   trip wins and alerts Kate once; later trips keep the first reason and send nothing.
 * - clearBreaker() is Kate's Clear (Settings → POST /api/site-access). Logging in afterwards is
 *   siteLogin.js, so this file has no login code and runs on the edge too (sync-proxy).
 *
 * Design: docs/specs/sync-redesign-design-note.md, "Before any unattended run".
 * @requirements REQ-657
 */

import { alertAndLog } from '../alertKate.js';

const TABLE = 'site_access';
const ROW_ID = true;
// Kate's decision: the stored session is good for 30 h. A login page in a response is the real
// expiry signal; this stamp only stops a run from using a session nobody has refreshed.
export const SESSION_TTL_MS = 30 * 60 * 60 * 1000;
export const SETTINGS_URL = 'https://qboarding.vercel.app/settings';
export const ALERT_JOB = 'site-access';

/** Thrown by getSiteSession. `code` is 'SITE_BLOCKED' or 'NO_SESSION'. */
export class SiteAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SiteAccessError';
    this.code = code;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase  service key
 * @returns {Promise<Object>} the row
 * @throws {Error} on any query error, or when the row is missing (migration 028 creates it; the
 *   anon key also reads no row). Neither is ever read as "not blocked".
 */
export async function readSiteAccess(supabase) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('session_cookies, session_expires_at, blocked_at, blocked_reason')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`site_access read failed: ${error.message}`);
  if (!data) throw new Error('site_access read failed: no row (is the service key set?)');
  return data;
}

/**
 * The stored session's cookie. Never logs in.
 * @throws {SiteAccessError} SITE_BLOCKED while the breaker is tripped; NO_SESSION when there's no
 *   session or its stamp has passed
 * @throws {Error} when the table can't be read
 */
export async function getSiteSession(supabase) {
  const row = await readSiteAccess(supabase);
  if (row.blocked_at) {
    throw new SiteAccessError('SITE_BLOCKED', `Booking site blocked since ${row.blocked_at}: ${row.blocked_reason}`);
  }
  if (!row.session_cookies || !row.session_expires_at) {
    throw new SiteAccessError('NO_SESSION', 'No booking-site session stored (cron-auth signs in at 00:00 UTC)');
  }
  if (Date.now() >= new Date(row.session_expires_at).getTime()) {
    throw new SiteAccessError('NO_SESSION', `Booking-site session expired at ${row.session_expires_at}`);
  }
  return row.session_cookies;
}

/** Store a new session, stamped SESSION_TTL_MS from now. Returns the stamp (ISO). */
export async function storeSiteSession(supabase, cookies) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: ROW_ID, session_cookies: cookies, session_expires_at: expiresAt, updated_at: new Date().toISOString() });
  if (error) throw new Error(`site_access session write failed: ${error.message}`);
  return expiresAt;
}

/** Forget a session the site rejected; the next cron-auth or Clear logs in. */
export async function clearSiteSession(supabase) {
  const { error } = await supabase
    .from(TABLE)
    .update({ session_cookies: null, session_expires_at: null, updated_at: new Date().toISOString() })
    .eq('id', ROW_ID);
  if (error) throw new Error(`site_access session clear failed: ${error.message}`);
}

/** Hour and minute in Pacific time, e.g. "17:05 PDT". */
function pacificTime(date) {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  });
}

/**
 * The alert Kate gets when the breaker trips.
 * @param {string} reason  e.g. "it answered 429 (too many requests) on a schedule page"
 * @param {{ rejectedLogin?: boolean }} opts
 */
export function breakerAlertText(reason, { rejectedLogin = false } = {}, now = new Date()) {
  return [
    `⛔ Booking site blocked ${pacificTime(now)}: ${reason}.`,
    rejectedLogin ? 'Update the password in Vercel before you press Clear.' : null,
    `Nothing will contact the booking site until you press Clear in Settings: ${SETTINGS_URL}`,
    'The roster uses the data already in the app.',
  ].filter(Boolean).join('\n');
}

/**
 * Trip the breaker. Only the first trip records its reason and alerts; a trip while already
 * tripped changes nothing. Never throws: it's called on the way to stopping a run.
 *
 * @returns {Promise<boolean>} true when this call tripped it (and sent the alert)
 */
export async function tripBreaker(supabase, reason, { rejectedLogin = false } = {}) {
  const now = new Date();
  let first;
  let writeError = null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ blocked_at: now.toISOString(), blocked_reason: reason, updated_at: now.toISOString() })
      .eq('id', ROW_ID)
      .is('blocked_at', null)
      .select('id');
    if (error) throw new Error(error.message);
    first = data.length > 0;
    // 0 rows changed means "already tripped" only if the row is there and tripped
    if (!first && !(await readSiteAccess(supabase)).blocked_at) throw new Error('the block was not recorded');
  } catch (err) {
    writeError = err.message;
    first = true; // couldn't record it: alert anyway, so the stop is never silent
  }

  if (!first) {
    console.log(`[SiteAccess] Breaker already tripped; not alerting again (${reason})`);
    return false;
  }

  console.error(`[SiteAccess] ⛔ Breaker tripped: ${reason}`);
  let text = breakerAlertText(reason, { rejectedLogin }, now);
  if (writeError) text += `\n(Couldn't record the block, so the next run may try again: ${writeError})`;
  await alertAndLog(supabase, ALERT_JOB, text);
  return true;
}

/**
 * Kate's Clear: one conditional update, so two presses clear (and log in) once.
 * @param {string} who  the signed-in user's email or id
 * @returns {Promise<boolean>} true when this call cleared it; false when it wasn't blocked
 */
export async function clearBreaker(supabase, who) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ blocked_at: null, blocked_reason: null, cleared_at: now, cleared_by: who, updated_at: now })
    .eq('id', ROW_ID)
    .not('blocked_at', 'is', null)
    .select('id');
  if (error) throw new Error(`site_access clear failed: ${error.message}`);
  return data.length > 0;
}

/** "a schedule page", "a booking page", "a form page" or "the login page", for the alert. */
export function describeSitePath(url) {
  let path;
  try {
    path = new URL(url, 'https://agirlandyourdog.com').pathname;
  } catch {
    return 'a page';
  }
  if (path.startsWith('/schedule/a/')) return 'a booking page';
  if (path.startsWith('/schedule')) return 'a schedule page';
  if (path.startsWith('/pets/')) return 'a form page';
  if (path.startsWith('/login')) return 'the login page';
  return 'a page';
}

/** The breaker reason for a 429/403. */
export function throttleReason(status, url) {
  const what = status === 429 ? '429 (too many requests)' : `${status} (refused)`;
  return `it answered ${what} on ${describeSitePath(url)}`;
}

export default {
  readSiteAccess, getSiteSession, storeSiteSession, clearSiteSession, tripBreaker, clearBreaker,
  breakerAlertText, throttleReason, describeSitePath,
};
