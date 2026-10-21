/**
 * Server-side proxy for Sync Now's booking-site reads (the browser can't call the site: CORS).
 * Callers: the browser only, as a signed-in user (REQ-656).
 *
 * Booking-site safety (#324, REQ-657):
 * - The session stays on the server: the proxy adds the stored cookie (site_access) itself and
 *   never returns it or any Set-Cookie. The browser never logs in; only cron-auth and Clear do.
 * - While the breaker is tripped it answers { blocked: true } without contacting the site.
 * - It fetches only the site's sync paths (schedule, booking, forms), GET only, and follows no
 *   redirects: status and Location go back to the browser (reconciliation reads them).
 * - A 429 or 403 trips the breaker here, on the server, and alerts Kate once.
 *
 * @requirements REQ-100, REQ-104, REQ-656, REQ-657
 */

import { createClient } from '@supabase/supabase-js';
import { verifyUser } from '../src/lib/verifyUser.js';
import { getSiteSession, tripBreaker, throttleReason } from '../src/lib/scraper/siteAccess.js';

export const config = {
  runtime: 'edge',
};

const EXTERNAL_HOST = 'agirlandyourdog.com';
const EXTERNAL_BASE_URL = `https://${EXTERNAL_HOST}`;

/** The paths Sync Now reads. Anything else is refused before any request. */
const SYNC_PATHS = [
  /^\/schedule$/,
  /^\/schedule\/days-7\/\d{4}\/\d{1,2}\/\d{1,2}$/,
  /^\/schedule\/a\/[A-Za-z0-9]+(\/\d+)?$/,
  /^\/pets\/[A-Za-z0-9]+\/forms$/,
  /^\/pets\/[A-Za-z0-9]+\/forms\/\d+\/view\/\d+$/,
];

/** True when `url` is one of the site's sync pages (on its own host, over https). */
export function isSyncUrl(url) {
  let parsed;
  try {
    parsed = new URL(url, EXTERNAL_BASE_URL);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && parsed.hostname === EXTERNAL_HOST
    && parsed.port === '' && !parsed.username && !parsed.password
    && SYNC_PATHS.some((re) => re.test(parsed.pathname));
}

/**
 * Sanitize error messages to avoid leaking sensitive information
 */
function sanitizeError(message) {
  if (!message) return 'Unknown error';
  let sanitized = message.replace(/https?:\/\/[^\s]+/g, '[URL]');
  sanitized = sanitized.replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');
  sanitized = sanitized.replace(/username[=:]\s*\S+/gi, 'username=[REDACTED]');
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '...';
  }
  return sanitized;
}

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serviceDb() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server misconfigured: Supabase service key not set');
  return createClient(url, key);
}

/** @param {{ getDb?: () => import('@supabase/supabase-js').SupabaseClient }} [deps] */
export function makeHandler({ getDb = serviceDb } = {}) {
  return async function handler(request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const auth = await verifyUser(request.headers.get('authorization'));
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    try {
      const { action, url, method = 'GET' } = await request.json();

      if (action !== 'fetch') return json({ success: false, error: `Unknown action: ${action}` }, 400);
      if (!url) return json({ success: false, error: 'URL is required' }, 400);
      // Reads only: the sync never writes to the booking site.
      if (method !== 'GET') return json({ success: false, error: 'Only GET is allowed' }, 400);
      if (!isSyncUrl(url)) return json({ success: false, error: 'URL not allowed' }, 403);

      const db = getDb();
      let cookies;
      try {
        cookies = await getSiteSession(db);
      } catch (err) {
        if (err.code === 'SITE_BLOCKED') return json({ success: false, blocked: true, error: err.message }, 423);
        if (err.code === 'NO_SESSION') return json({ success: false, noSession: true, error: err.message }, 503);
        throw err; // a failed read: fail closed
      }

      const fullUrl = new URL(url, EXTERNAL_BASE_URL).href;
      const response = await fetch(fullUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
          'Cookie': cookies,
        },
      });

      if (response.status === 429 || response.status === 403) {
        await tripBreaker(db, throttleReason(response.status, fullUrl));
      }

      const html = await response.text();
      return json({
        success: response.ok,
        status: response.status,
        html,
        location: response.headers.get('location') || '',
      }, 200);
    } catch (error) {
      console.error('[sync-proxy] Error:', error);
      return json({ success: false, error: sanitizeError(error.message) }, 500);
    }
  };
}

export default makeHandler();
