/**
 * Session cache — persists the external-site session cookie in sync_settings.
 *
 * Cron functions (cron-auth, cron-schedule, cron-detail) call getSession() to
 * retrieve a cached session before making any requests to the external site.
 * cron-auth calls storeSession() after a successful re-authentication.
 * Any cron function that detects a rejected session calls clearSession().
 *
 * @requirements REQ-109
 */

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

export default { getSession, storeSession, clearSession };
