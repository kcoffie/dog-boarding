/**
 * Cron handler: refresh the external-site session.
 *
 * Hobby plan schedule (vercel.json): "0 0 * * *" — once per day at midnight UTC
 * Pro plan schedule (upgrade path):  "0 *\/6 * * *" — every 6 hours
 *
 * Always re-authenticates — no "skip if still valid" logic.
 *
 * Rationale: the previous skip caused a race condition. If the previous auth
 * session was stored a few minutes late (e.g. 00:27 instead of 00:00), the
 * midnight cron saw it as "still valid" and skipped re-auth. The session then
 * expired at 00:27, leaving all subsequent crons (schedule, detail, notify)
 * without a valid session for 24 hours. Since this cron runs once a day, the
 * cost of an unconditional re-auth is negligible — one HTTP call at midnight.
 *
 * Runs on Node.js runtime (NOT edge) so process.env is available.
 *
 * @requirements REQ-109
 */

import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../src/lib/scraper/auth.js';
import { storeSession } from '../src/lib/scraper/sessionCache.js';
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
    // Always re-authenticate — unconditional daily refresh.
    // See module docstring for why the "skip if valid" approach was removed.
    console.log('[CronAuth] 🔐 Starting auth refresh (unconditional)');
    const supabase = getSupabase();

    const username = process.env.EXTERNAL_SITE_USERNAME;
    const password = process.env.EXTERNAL_SITE_PASSWORD;
    if (!username || !password) {
      throw new Error('External site credentials not configured (EXTERNAL_SITE_USERNAME / EXTERNAL_SITE_PASSWORD)');
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
