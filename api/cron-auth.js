/**
 * Cron handler: refresh the external-site session.
 *
 * Hobby plan schedule (vercel.json): "0 0 * * *" — once per day at midnight UTC
 * Pro plan schedule (upgrade path):  "0 *\/6 * * *" — every 6 hours
 *
 * Always re-authenticates — no "skip if still valid" logic. It and Clear (POST /api/site-access)
 * are the only paths that log in, both through loginToSite (#324): nothing logs in while the
 * breaker is tripped, and a rejected login trips it.
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
 * @requirements REQ-109, REQ-657
 */

import { createClient } from '@supabase/supabase-js';
import { loginToSite } from '../src/lib/scraper/siteLogin.js';
import { writeCronHealth } from './_cronHealth.js';

export const config = { runtime: 'nodejs' };

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  // The service key only: site_access has no policies, so another key reads no row (#324)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Vercel cron secret; fails closed when CRON_SECRET is unset
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Always re-authenticate — unconditional daily refresh.
    // See module docstring for why the "skip if valid" approach was removed.
    console.log('[CronAuth] 🔐 Starting auth refresh (unconditional)');
    const supabase = getSupabase();

    // Write 'started' immediately so the health checker can detect hard crashes
    // (where the cron exits before writing success/failure).
    await writeCronHealth(supabase, 'auth', 'started', { action: 'running' }, null);

    const login = await loginToSite(supabase);
    if (login.blocked) {
      // Not a cron failure: the breaker alerted when it tripped, and ops-watch reports it daily
      console.log('[CronAuth] ⛔ Booking site blocked: not logging in');
      await writeCronHealth(supabase, 'auth', 'success', { action: 'site_blocked' }, null);
      return res.status(200).json({ ok: true, action: 'site_blocked' });
    }
    if (!login.ok) throw new Error(login.error);

    console.log(`[CronAuth] ✅ Session cached (expires: ${login.expiresAt})`);
    await writeCronHealth(supabase, 'auth', 'success', { action: 'refreshed', expiresAt: login.expiresAt }, null);
    return res.status(200).json({ ok: true, action: 'refreshed', expiresAt: login.expiresAt });
  } catch (err) {
    console.error('[CronAuth] ❌ Unhandled error:', err.message, err.stack);
    try {
      const supabase = getSupabase();
      await writeCronHealth(supabase, 'auth', 'failure', null, err.message.slice(0, 500));
    } catch { /* ignore — don't mask original error */ }
    return res.status(500).json({ error: err.message });
  }
}
