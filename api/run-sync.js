/**
 * On-demand sync trigger — server-side wrapper around runSync.
 *
 * Called by the integration check GitHub Actions workflow before it scrapes
 * and compares. Secured with the same VITE_SYNC_PROXY_TOKEN used by the
 * browser sync path.
 *
 * Auth pattern mirrors cron-schedule.js: load session from DB via getSession(),
 * inject into the auth module via setSession(), then call runSync(). This lets
 * runSync skip its own authenticate() step because isAuthenticated() is already
 * true — avoids a circular server→sync-proxy→server call.
 *
 * Returns:
 *   200 { ok: true, synced, skipped, failed, durationMs }  — sync completed
 *   503 { ok: false, reason: 'no_session' }               — no cached session
 *   500 { ok: false, error }                              — sync threw
 *
 * Runs on Node.js runtime (NOT edge) — needs process.env + src/ imports.
 */

import { createClient } from '@supabase/supabase-js';
import { setSession } from '../src/lib/scraper/auth.js';
import { getSession } from '../src/lib/scraper/sessionCache.js';
import { runSync } from '../src/lib/scraper/sync.js';

export const config = { runtime: 'nodejs' };

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  // Service role key is required — anon key is subject to RLS and cannot read
  // sync_settings. Fail loud rather than silently falling back to a key that
  // will produce cryptic permission errors downstream.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail closed — if the token env var is missing, reject rather than allowing
  // any caller to trigger a full production sync.
  const proxyToken = process.env.VITE_SYNC_PROXY_TOKEN;
  if (!proxyToken) {
    console.error('[RunSync] VITE_SYNC_PROXY_TOKEN not configured — rejecting request');
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (req.headers.authorization !== `Bearer ${proxyToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[RunSync] On-demand sync triggered');

  try {
    const supabase = getSupabase();

    // Load cached session — same pattern as cron-schedule.js.
    // Injecting it via setSession() means runSync sees isAuthenticated()=true
    // and skips its own authenticate() call, which would otherwise try to
    // POST to /api/sync-proxy (a server→server circular call).
    const cookies = await getSession(supabase);
    if (!cookies) {
      console.log('[RunSync] No valid session cached — cannot sync');
      return res.status(503).json({ ok: false, reason: 'no_session' });
    }

    setSession(cookies);

    // Default window: today → today+7d (matches the integration check query window)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 7);

    // Log the window before the expensive call so a Vercel timeout mid-run
    // still leaves a breadcrumb showing what was attempted.
    console.log('[RunSync] Starting runSync — window: %s → %s', today.toISOString(), windowEnd.toISOString());

    const result = await runSync({
      supabase,
      startDate: today,
      endDate: windowEnd,
    });

    console.log(
      '[RunSync] runSync returned — success: %s, status: %s, found: %d, created: %d, updated: %d, skipped: %d, failed: %d, duration: %dms',
      result.success,
      result.status,
      result.appointmentsFound,
      result.appointmentsCreated,
      result.appointmentsUpdated,
      result.appointmentsSkipped,
      result.appointmentsFailed,
      result.durationMs,
    );

    return res.status(200).json({
      ok: result.success,
      status: result.status,
      synced: result.appointmentsCreated + result.appointmentsUpdated,
      skipped: result.appointmentsSkipped,
      failed: result.appointmentsFailed,
      durationMs: result.durationMs,
      errors: result.errors,
    });

  } catch (err) {
    console.error('[RunSync] Unhandled error:', err.message, err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
