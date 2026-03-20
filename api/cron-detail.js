/**
 * Cron handler: fetch one detail page and upsert to DB.
 *
 * Hobby plan schedule (vercel.json): "10 0 * * *" — once per day at 12:10am UTC
 * Pro plan schedule (upgrade path):  "*\/5 * * * *" — every 5 minutes
 *
 * NOTE: Hobby plan processes 1 queue item per day (Vercel 10s timeout).
 * Use manual "Sync Now" in the UI for immediate processing of multiple items.
 *
 * Core logic lives in src/lib/scraper/syncRunner.js — this is a thin Vercel
 * handler wrapper responsible only for auth gating and health tracking.
 *
 * Runs on Node.js runtime (NOT edge) so process.env is available.
 *
 * @requirements REQ-109
 */

import { createClient } from '@supabase/supabase-js';
import { runDetailSync } from '../src/lib/scraper/syncRunner.js';
import { resetStuck } from '../src/lib/scraper/syncQueue.js';
import { writeCronHealth } from './_cronHealth.js';

export const config = { runtime: 'nodejs' };

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
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

    // Reset stuck items before processing. runDetailSync is called with
    // runResetStuck: false because we handle it here explicitly (single call,
    // no loop — no redundancy concern). This matches pre-refactor behavior.
    const resetCount = await resetStuck(supabase);
    if (resetCount > 0) {
      console.log(`[CronDetail] ⚠️ Reset ${resetCount} stuck item(s) to pending`);
    }

    const result = await runDetailSync(supabase, { runResetStuck: false });

    if (result.action === 'session_failed') {
      await writeCronHealth(supabase, 'detail', 'failure', { action: 'session_failed' }, result.error?.slice(0, 500));
      return res.status(200).json({ ok: true, ...result });
    }

    if (result.action === 'session_cleared') {
      await writeCronHealth(supabase, 'detail', 'success', { action: 'session_cleared' }, null);
      return res.status(200).json({ ok: true, ...result });
    }

    await writeCronHealth(supabase, 'detail', 'success', {
      action: result.action,
      externalId: result.externalId,
      queueDepth: result.queueDepth,
    }, null);

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[CronDetail] ❌ Unhandled error:', err.message, err.stack);
    try {
      const supabase = getSupabase();
      await writeCronHealth(supabase, 'detail', 'failure', null, err.message.slice(0, 500));
    } catch { /* ignore */ }
    return res.status(500).json({ error: err.message });
  }
}
