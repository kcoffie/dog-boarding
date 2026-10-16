/* global process */
/**
 * Drain the sync_queue by hand (runbook: "Queue is backed up").
 *
 * Runs the same runDetailSync() the nightly crons use, one item at a time, until the queue is
 * idle, the session fails, or the cap is reached. Sends no WhatsApp. Pauses between items so AGYD
 * isn't hammered. Writes to the database through the normal sync path only.
 *
 * Usage: node scripts/drain-queue.js [maxItems=1000]   (needs .env.local: Supabase service key)
 */
import { createClient } from '@supabase/supabase-js';
import { runDetailSync } from '../src/lib/scraper/syncRunner.js';
import { resetStuck } from '../src/lib/scraper/syncQueue.js';

const max = Number(process.argv[2] ?? 1000);
const PAUSE_MS = 1000;
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

await resetStuck(supabase);
const counts = {};
let last;
for (let i = 0; i < max; i++) {
  last = await runDetailSync(supabase, { runResetStuck: false });
  counts[last.action] = (counts[last.action] ?? 0) + 1;
  if (i % 25 === 0) console.log(`[Drain] ${i + 1}: ${last.action}, queue ${last.queueDepth ?? '?'}`, counts);
  if (['idle', 'session_failed', 'session_cleared'].includes(last.action)) break;
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}
console.log('[Drain] done', counts, 'last:', last?.action, last?.error ?? '');
process.exit(last?.action === 'session_failed' ? 1 : 0);
