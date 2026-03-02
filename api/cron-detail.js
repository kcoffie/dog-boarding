/**
 * Cron handler: fetch one detail page and upsert to DB.
 *
 * Hobby plan schedule (vercel.json): "10 0 * * *" — once per day at 12:10am UTC
 * Pro plan schedule (upgrade path):  "*\/5 * * * *" — every 5 minutes
 *
 * NOTE: Hobby plan processes 1 queue item per day (Vercel 10s timeout).
 * Use manual "Sync Now" in the UI for immediate processing of multiple items.
 *
 * Picks the oldest pending item from sync_queue, fetches its detail page,
 * and saves the appointment data. On success marks as 'done'; on failure
 * applies retry backoff (up to 3 retries, then 'failed').
 *
 * Also resets any items stuck in 'processing' for more than 10 minutes.
 *
 * Runs on Node.js runtime (NOT edge) so process.env is available.
 *
 * @requirements REQ-109
 */

import { createClient } from '@supabase/supabase-js';
import { setSession } from '../src/lib/scraper/auth.js';
import { fetchAppointmentDetails } from '../src/lib/scraper/extraction.js';
import { mapAndSaveAppointment } from '../src/lib/scraper/mapping.js';
import { getSession, clearSession } from '../src/lib/scraper/sessionCache.js';
import {
  dequeueOne,
  markDone,
  markFailed,
  resetStuck,
  getQueueDepth,
} from '../src/lib/scraper/syncQueue.js';
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

  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();

    // Reset any items stuck in 'processing' before picking a new one
    const resetCount = await resetStuck(supabase);
    if (resetCount > 0) {
      console.log(`[CronDetail] ⚠️ Reset ${resetCount} stuck item(s) to pending`);
    }

    // Dequeue the next pending item
    const item = await dequeueOne(supabase);
    if (!item) {
      console.log('[CronDetail] 📭 Queue empty — nothing to process');
      await writeCronHealth(supabase, 'detail', 'success', { action: 'idle' }, null);
      return res.status(200).json({ ok: true, action: 'idle' });
    }

    // Load cached session
    const cookies = await getSession(supabase);
    if (!cookies) {
      console.log('[CronDetail] ⏭️ No valid session — releasing item back to pending');
      // Reset the item we just dequeued so it can be picked up after re-auth
      await supabase
        .from('sync_queue')
        .update({ status: 'pending', processing_started_at: null })
        .eq('id', item.id);
      await writeCronHealth(supabase, 'detail', 'success', { action: 'skipped', reason: 'no_session' }, null);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_session' });
    }

    // Inject session into auth module
    setSession(cookies);

    // Extract appointmentId and timestamp from source_url
    const urlMatch = item.source_url.match(/\/schedule\/a\/([^/]+)\/(\d+)/);
    const [, appointmentId, timestamp] = urlMatch || [null, item.external_id, ''];

    const depth = await getQueueDepth(supabase);
    console.log(`[CronDetail] 🐕 Processing 1 of ${depth + 1} queued: ${item.external_id}`);
    console.log(`[CronDetail]    source_url: ${item.source_url}`);

    let details;
    try {
      details = await fetchAppointmentDetails(appointmentId, timestamp);
    } catch (err) {
      // Check for session expiry specifically
      if (err.message && err.message.includes('Session expired')) {
        console.log('[CronDetail] 🔒 Session rejected by server — clearing cached session');
        await clearSession(supabase);
        // Reset the dequeued item so it retries after re-auth
        await supabase
          .from('sync_queue')
          .update({ status: 'pending', processing_started_at: null })
          .eq('id', item.id);
        return res.status(200).json({ ok: true, action: 'session_cleared', reason: 'session_expired' });
      }
      // Other fetch errors — apply retry backoff
      const msg = err.message.slice(0, 200);
      console.error(`[CronDetail] ❌ Failed (retry ${(item.retry_count || 0) + 1}/3): ${msg}`);
      await markFailed(supabase, item.id, msg);
      const remaining = await getQueueDepth(supabase);
      await writeCronHealth(supabase, 'detail', 'success', { action: 'failed', externalId: item.external_id, queueDepth: remaining }, null);
      return res.status(200).json({ ok: true, action: 'failed', error: msg, queueDepth: remaining });
    }

    // Use schedule-page data as fallback for pet/client name
    // (same pattern as sync.js to prevent Unknown dog collapse)
    if (!details.pet_name && item.title) details.pet_name = item.title;

    try {
      const saveResult = await mapAndSaveAppointment(details, { supabase });
      await markDone(supabase, item.id);

      const { stats } = saveResult;
      const action = stats.syncCreated ? 'created'
        : stats.syncUpdated || stats.dogUpdated || stats.boardingUpdated ? 'updated'
        : 'unchanged';

      console.log(`[CronDetail] ✅ Saved: ${details.pet_name || details.external_id} — ${action}`);

      const remaining = await getQueueDepth(supabase);
      console.log(`[CronDetail] 📊 Queue depth remaining: ${remaining}`);

      await writeCronHealth(supabase, 'detail', 'success', { action, externalId: item.external_id, queueDepth: remaining }, null);
      return res.status(200).json({ ok: true, action, externalId: item.external_id, queueDepth: remaining });
    } catch (saveErr) {
      const msg = saveErr.message.slice(0, 200);
      console.error(`[CronDetail] ❌ Save failed (retry ${(item.retry_count || 0) + 1}/3): ${msg}`);
      await markFailed(supabase, item.id, msg);
      const remaining = await getQueueDepth(supabase);
      await writeCronHealth(supabase, 'detail', 'success', { action: 'save_failed', externalId: item.external_id, queueDepth: remaining }, null);
      return res.status(200).json({ ok: true, action: 'save_failed', error: msg, queueDepth: remaining });
    }
  } catch (err) {
    console.error('[CronDetail] ❌ Unhandled error:', err.message, err.stack);
    try {
      const supabase = getSupabase();
      await writeCronHealth(supabase, 'detail', 'failure', null, err.message.slice(0, 500));
    } catch { /* ignore */ }
    return res.status(500).json({ error: err.message });
  }
}
