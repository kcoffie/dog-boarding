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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const proxyToken = process.env.VITE_SYNC_PROXY_TOKEN;
  if (proxyToken && req.headers.authorization !== `Bearer ${proxyToken}`) {
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
    console.log('[RunSync] Session loaded, starting runSync...');

    // Default window: today → today+7d (matches the integration check query window)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 7);

    const result = await runSync({
      supabase,
      startDate: today,
      endDate: windowEnd,
    });

    console.log(
      '[RunSync] Sync complete — found: %d, created: %d, updated: %d, skipped: %d, failed: %d, duration: %dms',
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
