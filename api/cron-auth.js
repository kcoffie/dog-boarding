/**
 * Cron handler: refresh the external-site session.
 *
 * Hobby plan schedule (vercel.json): "0 0 * * *" — once per day at midnight UTC
 * Pro plan schedule (upgrade path):  "0 *\/6 * * *" — every 6 hours
 *
 * If the cached session is still valid, skips re-authentication.
 * If expired or missing, authenticates fresh and stores the new session in DB.
 *
 * Runs on Node.js runtime (NOT edge) so process.env is available.
 *
 * @requirements REQ-109
 */

import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../src/lib/scraper/auth.js';
import { getSession, storeSession } from '../src/lib/scraper/sessionCache.js';
import { writeCronHealth } from './_cronHealth.js';

export const config = { runtime: 'nodejs' };

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  // Prefer service role key (bypasses RLS) for server-side cron operations
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Vercel cron secret (skipped in local dev when CRON_SECRET is not set)
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CronAuth] 🔐 Starting auth refresh');
    const supabase = getSupabase();

    // If the cached session is still valid, nothing to do
    const existing = await getSession(supabase);
    if (existing) {
      console.log('[CronAuth] ⏭️ Session still valid, skipping re-auth');
      await writeCronHealth(supabase, 'auth', 'success', { action: 'skipped', reason: 'session_valid' }, null);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'session_valid' });
    }

    // Re-authenticate
    console.log('[CronAuth] 🔑 Session expired or missing, re-authenticating...');
    const username = process.env.VITE_EXTERNAL_SITE_USERNAME;
    const password = process.env.VITE_EXTERNAL_SITE_PASSWORD;
    if (!username || !password) {
      throw new Error('External site credentials not configured (VITE_EXTERNAL_SITE_USERNAME / VITE_EXTERNAL_SITE_PASSWORD)');
    }

    const result = await authenticate(username, password);
    if (!result.success) {
      throw new Error(`Authentication failed: ${result.error}`);
    }

    const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    await storeSession(supabase, result.cookies, SESSION_TTL_MS);

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    console.log(`[CronAuth] ✅ Session cached (expires: ${expiresAt})`);

    await writeCronHealth(supabase, 'auth', 'success', { action: 'refreshed', expiresAt }, null);
    return res.status(200).json({ ok: true, action: 'refreshed', expiresAt });
  } catch (err) {
    console.error('[CronAuth] ❌ Unhandled error:', err.message, err.stack);
    try {
      const supabase = getSupabase();
      await writeCronHealth(supabase, 'auth', 'failure', null, err.message.slice(0, 500));
    } catch { /* ignore — don't mask original error */ }
    return res.status(500).json({ error: err.message });
  }
}
