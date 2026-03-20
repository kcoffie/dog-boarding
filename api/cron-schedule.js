/**
 * Cron handler: scan schedule pages and queue new appointments.
 *
 * Hobby plan schedule (vercel.json): "5 0 * * *" — once per day at 12:05am UTC
 * Pro plan schedule (upgrade path):  "0 * * * *" — every hour
 *
 * Strategy: fetch THREE pages per call —
 *   1. Current week (always) — catches active long-stay boardings
 *   2. Next week (always) — eliminates 1-week discovery blind spot
 *   3. Cursor week (rotating, weeks 2–8) — advances +7d each call, wraps at today+56d
 *
 * This ensures bookings in the next 2 weeks are seen every night, and bookings
 * 2–8 weeks out appear within 6 nights (one full cursor cycle over weeks 2–7).
 *
 * Core logic lives in src/lib/scraper/syncRunner.js — this is a thin Vercel
 * handler wrapper responsible only for auth gating and health tracking.
 *
 * Runs on Node.js runtime (NOT edge) so process.env is available.
 *
 * @requirements REQ-109
 */

import { createClient } from '@supabase/supabase-js';
import { runScheduleSync } from '../src/lib/scraper/syncRunner.js';
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

    // Write 'started' immediately so the health checker can detect hard crashes.
    await writeCronHealth(supabase, 'schedule', 'started', { action: 'running' }, null);

    const result = await runScheduleSync(supabase);

    if (result.action === 'session_failed') {
      await writeCronHealth(supabase, 'schedule', 'failure', { action: 'session_failed' }, result.error?.slice(0, 500));
      return res.status(200).json({ ok: true, ...result });
    }

    if (result.action === 'session_cleared') {
      await writeCronHealth(supabase, 'schedule', 'success', { action: 'session_cleared', reason: result.reason }, null);
      return res.status(200).json({ ok: true, ...result });
    }

    await writeCronHealth(supabase, 'schedule', 'success', {
      pagesScanned: result.pagesScanned,
      found: result.found,
      skipped: result.skipped,
      queued: result.queued,
      cursorAdvancedTo: result.cursorAdvancedTo,
      queueDepth: result.queueDepth,
    }, null);

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[CronSchedule] ❌ Unhandled error:', err.message, err.stack);
    try {
      const supabase = getSupabase();
      await writeCronHealth(supabase, 'schedule', 'failure', null, err.message.slice(0, 500));
    } catch { /* ignore */ }
    return res.status(500).json({ error: err.message });
  }
}
