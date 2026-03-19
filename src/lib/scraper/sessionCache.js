/**
 * Session cache — persists the external-site session cookie in sync_settings.
 *
 * Cron functions (cron-auth, cron-schedule, cron-detail) call getSession() to
 * retrieve a cached session before making any requests to the external site.
 * cron-auth calls storeSession() after a successful re-authentication.
 * Any cron function that detects a rejected session calls clearSession().
 *
 * ensureSession() is the self-healing entry point: it returns a valid session
 * (from cache if available, fresh from re-auth if not) or throws. Crons that
 * call ensureSession() become resilient to missed auth refreshes.
 *
 * @requirements REQ-109
 */

import { authenticate } from './auth.js';
import { syncLogger } from './logger.js';

const log = syncLogger.log;
const logError = syncLogger.error;

/**
 * Get the cached session cookie string if still valid.
 * Returns null when there is no cached session or when it has expired.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<string|null>}
 */
export async function getSession(supabase) {
  const { data, error } = await supabase
    .from('sync_settings')
    .select('session_cookies, session_expires_at')
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no rows — not an error
    throw error;
  }

  if (!data?.session_cookies || !data?.session_expires_at) return null;

  const expiresAt = new Date(data.session_expires_at);
  if (Date.now() >= expiresAt.getTime()) {
    log('[SessionCache] ⏰ Cached session is expired');
    return null;
  }

  const remainingH = Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
  log(`[SessionCache] ✅ Session valid (~${remainingH}h remaining)`);
  return data.session_cookies;
}

/**
 * Store a session cookie string in sync_settings.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} cookies - Cookie string from authenticate()
 * @param {number} [expiryMs=86400000] - Lifetime in ms from now (default 24h)
 * @returns {Promise<void>}
 */
export async function storeSession(supabase, cookies, expiryMs = 24 * 60 * 60 * 1000) {
  const expiresAt = new Date(Date.now() + expiryMs).toISOString();

  // sync_settings is a single-row table; read the row id before writing.
  const { data: existing } = await supabase
    .from('sync_settings')
    .select('id')
    .limit(1)
    .single();

  let error;
  if (existing) {
    ({ error } = await supabase
      .from('sync_settings')
      .update({ session_cookies: cookies, session_expires_at: expiresAt })
      .eq('id', existing.id));
  } else {
    ({ error } = await supabase
      .from('sync_settings')
      .insert({ session_cookies: cookies, session_expires_at: expiresAt }));
  }

  if (error) throw error;
  log(`[SessionCache] 💾 Session stored (expires: ${expiresAt})`);
}

/**
 * Clear the cached session from sync_settings.
 * Called when a cron function detects that the server rejected the cached cookies.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<void>}
 */
export async function clearSession(supabase) {
  const { data: existing } = await supabase
    .from('sync_settings')
    .select('id')
    .limit(1)
    .single();

  if (!existing) return;

  const { error } = await supabase
    .from('sync_settings')
    .update({ session_cookies: null, session_expires_at: null })
    .eq('id', existing.id);

  if (error) {
    logError('[SessionCache] ⚠️ Failed to clear session:', error.message);
    throw error;
  }
  log('[SessionCache] 🗑️ Session cleared');
}

/**
 * Get a valid session cookie string, re-authenticating if the cache is empty
 * or expired. Throws if credentials are missing or authentication fails.
 *
 * This is the self-healing entry point for crons. Callers should use this
 * instead of getSession() so they recover automatically from a missed
 * cron-auth run rather than skipping their work entirely.
 *
 * After getting cookies back, callers must still call setSession(cookies) to
 * inject them into the in-memory auth module for authenticatedFetch to use.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<string>} Cookie string — never null
 * @throws {Error} If credentials are missing or authentication fails
 */
export async function ensureSession(supabase) {
  // Fast path: cached session is still valid — no network call needed
  const cached = await getSession(supabase);
  if (cached) {
    log('[SessionCache] ✅ ensureSession: cached session valid');
    return cached;
  }

  // Cache miss or expiry — re-authenticate now
  log('[SessionCache] 🔑 ensureSession: no valid session, re-authenticating...');

  const username = process.env.EXTERNAL_SITE_USERNAME;
  const password = process.env.EXTERNAL_SITE_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'ensureSession: external site credentials not configured ' +
      '(EXTERNAL_SITE_USERNAME / EXTERNAL_SITE_PASSWORD)'
    );
  }

  const result = await authenticate(username, password);
  if (!result.success) {
    throw new Error(`ensureSession: authentication failed — ${result.error}`);
  }

  const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  await storeSession(supabase, result.cookies, SESSION_TTL_MS);
  log('[SessionCache] ✅ ensureSession: session refreshed and cached');
  return result.cookies;
}

export default { getSession, storeSession, clearSession, ensureSession };
