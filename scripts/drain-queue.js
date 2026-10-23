/* global process */
/**
 * Drain the sync_queue by hand (runbook: "Queue is backed up").
 *
 * Runs the same runDetailSync() the nightly crons use, one item at a time, until the queue is
 * idle, the session fails, the breaker is tripped (#324), or the cap is reached. Never logs in. Sends no WhatsApp; sends Kate one Telegram alert if a booking page couldn't be read (#344). Pauses between items so AGYD
 * isn't hammered. Writes to the database through the normal sync path only.
 *
 * Usage: node scripts/drain-queue.js [maxItems=1000]   (needs .env.local: Supabase service key)
 */
import { createClient } from '@supabase/supabase-js';
import { drainDetailQueue } from '../src/lib/scraper/syncRunner.js';
import { resetStuck } from '../src/lib/scraper/syncQueue.js';

const max = Number(process.argv[2] ?? 1000);
const PAUSE_MS = 1000;
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

await resetStuck(supabase);
const counts = {};
// Sends one alert for booking pages it couldn't read, as the crons do (#344)
const results = await drainDetailQueue(supabase, {
  maxItems: max,
  pauseMs: PAUSE_MS,
  onItem: (result, i) => {
    counts[result.action] = (counts[result.action] ?? 0) + 1;
    if (i % 25 === 0) console.log(`[Drain] ${i + 1}: ${result.action}, queue ${result.queueDepth ?? '?'}`, counts);
  },
});
const last = results.at(-1);
console.log('[Drain] done', counts, 'last:', last?.action, last?.error ?? '');
process.exit(last?.action === 'session_failed' ? 1 : 0);
