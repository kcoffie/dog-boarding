/**
 * The one booking-site login (#324 part B). Only cron-auth and Kate's Clear call it; every other
 * path reads the stored session with getSiteSession and never logs in.
 *
 * It checks the breaker first, so nothing logs in while it's tripped. A rejected login, or a
 * 429/403 on the login, trips it (one alert); a 5xx or a network error fails without tripping.
 *
 * @requirements REQ-657, REQ-109
 */

import { authenticate } from './auth.js';
import { readSiteAccess, storeSiteSession, tripBreaker, throttleReason } from './siteAccess.js';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase  service key
 * @param {{ env?: object }} [deps]
 * @returns {Promise<{ ok: true, expiresAt: string }
 *   | { ok: false, blocked: true, error: string }
 *   | { ok: false, tripped: boolean, error: string }>}
 * @throws {Error} when site_access can't be read or the new session can't be stored
 */
export async function loginToSite(supabase, { env = process.env } = {}) {
  const row = await readSiteAccess(supabase);
  if (row?.blocked_at) {
    console.log('[SiteLogin] Breaker tripped: not logging in');
    return { ok: false, blocked: true, error: `Booking site blocked since ${row.blocked_at}: ${row.blocked_reason}` };
  }

  const username = env.EXTERNAL_SITE_USERNAME;
  const password = env.EXTERNAL_SITE_PASSWORD;
  if (!username || !password) {
    return { ok: false, tripped: false, error: 'External site credentials not configured (EXTERNAL_SITE_USERNAME / EXTERNAL_SITE_PASSWORD)' };
  }

  console.log('[SiteLogin] 🔐 Logging in to the booking site');
  const result = await authenticate(username, password);
  if (result.success) {
    const expiresAt = await storeSiteSession(supabase, result.cookies);
    console.log(`[SiteLogin] ✅ Session stored (expires: ${expiresAt})`);
    return { ok: true, expiresAt };
  }

  const error = `Authentication failed: ${result.error}`;
  if (result.rejected) {
    await tripBreaker(supabase, 'it refused the login', { rejectedLogin: true });
    return { ok: false, tripped: true, error };
  }
  if (result.throttled) {
    await tripBreaker(supabase, throttleReason(result.status, '/login'));
    return { ok: false, tripped: true, error };
  }
  return { ok: false, tripped: false, error };
}

export default { loginToSite };
