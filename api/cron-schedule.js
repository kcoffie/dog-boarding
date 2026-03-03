/**
 * Cron handler: scan schedule pages and queue new appointments.
 *
 * Hobby plan schedule (vercel.json): "5 0 * * *" — once per day at 12:05am UTC
 * Pro plan schedule (upgrade path):  "0 * * * *" — every hour
 *
 * Strategy: fetch TWO pages per call —
 *   1. Current week (always) — catches active long-stay boardings
 *   2. Cursor week (rotating) — advances +7 days each call, wraps at today+56d
 *
 * This ensures currently-active boardings are checked every hour, and future
 * bookings appear in the queue within 8 hours (one full 8-week cursor cycle).
 *
 * Appointment HTML parsing uses a regex-based approach (no DOMParser) so this
 * handler works in the Node.js runtime without browser APIs.
 *
 * Runs on Node.js runtime (NOT edge) so process.env is available.
 *
 * @requirements REQ-109
 */

import { createClient } from '@supabase/supabase-js';
import { setSession } from '../src/lib/scraper/auth.js';
import { authenticatedFetch } from '../src/lib/scraper/auth.js';
import { getSession, clearSession } from '../src/lib/scraper/sessionCache.js';
import { enqueue, getQueueDepth } from '../src/lib/scraper/syncQueue.js';
import { writeCronHealth } from './_cronHealth.js';

export const config = { runtime: 'nodejs' };

const BASE_URL = process.env.VITE_EXTERNAL_SITE_URL || 'https://agirlandyourdog.com';
const CURSOR_WINDOW_WEEKS = 8; // how many weeks the cursor cycles through

// Known non-boarding title patterns (mirrors sync.js pre-filter)
const NON_BOARDING_RE = [
  /(d\/c|\bdc\b)/i,
  /(p\/g|g\/p|\bpg\b)/i,
  /\badd\b/,
  /switch\s+day/i,
  /back\s+to\s+\d+/i,
  /initial\s+eval/i,
  /^busy$/i,
];

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  // Prefer service role key (bypasses RLS) for server-side cron operations
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

/**
 * Build the schedule URL for a specific week start date.
 * /schedule/days-7/YYYY/M/D
 */
function buildWeekUrl(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${BASE_URL}/schedule/days-7/${y}/${m}/${d}`;
}

/**
 * Fetch one schedule page and return its raw HTML.
 * Throws with message 'SESSION_EXPIRED' if the site serves a login page.
 *
 * This avoids importing parseSchedulePage from schedule.js which uses
 * DOMParser — a browser API unavailable in the Node.js runtime.
 */
async function fetchScheduleHtml(date) {
  const url = buildWeekUrl(date);
  const response = await authenticatedFetch(url);
  if (!response.ok) throw new Error(`Schedule fetch failed: ${response.status}`);
  const html = await response.text();
  if (html.includes('login') && html.includes('password')) {
    throw new Error('SESSION_EXPIRED');
  }
  return html;
}

/**
 * Extract appointment links from schedule page HTML using regex.
 * No DOMParser required — safe for Node.js runtime.
 *
 * Returns objects with: { id, url, timestamp, petName, clientName, time, title }
 */
function parseScheduleHtml(html) {
  const results = [];
  const seen = new Set();

  // Match each <a> block containing a /schedule/a/{id}/{ts} href.
  // Appointment links contain only <span>/<div> children — no nested <a>.
  const blockRe = /<a\b([^>]+href="[^"]*\/schedule\/a\/[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = blockRe.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];

    const hrefMatch = attrs.match(/href="([^"]+)"/);
    if (!hrefMatch) continue;

    const href = hrefMatch[1];
    const urlMatch = href.match(/\/schedule\/a\/([^/]+)\/(\d+)/);
    if (!urlMatch) continue;

    const id = urlMatch[1];
    if (seen.has(id)) continue;
    seen.add(id);

    // Extract text content of named child elements
    const pick = (cls) => {
      const r = inner.match(new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([^<]*)<`));
      return r ? r[1].trim() : '';
    };

    // Extract pet IDs from data-pet attributes on event-pet-wrapper elements
    const petIds = [];
    const petIdRe = /data-pet="([^"]+)"/g;
    let petMatch;
    while ((petMatch = petIdRe.exec(inner)) !== null) {
      petIds.push(petMatch[1]);
    }

    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    results.push({
      id,
      url: fullUrl,
      timestamp: urlMatch[2],
      petName: pick('event-pet'),
      clientName: pick('event-client'),
      time: pick('day-event-time'),
      title: pick('day-event-title'),
      petIds,
    });
  }

  return results;
}

/**
 * Read the current cursor date from sync_settings.
 * Returns today if not set.
 */
async function getCursorDate(supabase) {
  const { data } = await supabase
    .from('sync_settings')
    .select('schedule_cursor_date')
    .limit(1)
    .single();

  if (data?.schedule_cursor_date) {
    const [y, mo, d] = data.schedule_cursor_date.split('-').map(Number);
    return new Date(y, mo - 1, d); // local midnight
  }
  return new Date(); // first run: start at today
}

/**
 * Advance the cursor by 7 days.
 * Wraps back to today when the cursor would exceed today + CURSOR_WINDOW_WEEKS weeks.
 */
function advanceCursor(cursor) {
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + CURSOR_WINDOW_WEEKS * 7);

  const next = new Date(cursor);
  next.setDate(next.getDate() + 7);

  return next > maxDate ? new Date() : next;
}

/**
 * Persist the cursor date in sync_settings.
 */
async function saveCursorDate(supabase, date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const isoDate = `${y}-${m}-${d}`;

  const { data: existing } = await supabase
    .from('sync_settings')
    .select('id')
    .limit(1)
    .single();

  if (existing) {
    await supabase
      .from('sync_settings')
      .update({ schedule_cursor_date: isoDate })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('sync_settings')
      .insert({ schedule_cursor_date: isoDate });
  }
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

    // Load cached session — if missing, wait for cron-auth to run
    const cookies = await getSession(supabase);
    if (!cookies) {
      console.log('[CronSchedule] ⏭️ No valid session — waiting for cron-auth');
      await writeCronHealth(supabase, 'schedule', 'success', { action: 'skipped', reason: 'no_session' }, null);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_session' });
    }

    // Inject session into auth module for authenticatedFetch to use
    setSession(cookies);

    const cursorDate = await getCursorDate(supabase);
    const today = new Date();

    console.log(`[CronSchedule] 📅 Starting scan — cursor: ${cursorDate.toDateString()}, mode: micro`);
    console.log(`[CronSchedule] 🔑 Session: cached`);

    const stats = { pagesScanned: 0, found: 0, skipped: 0, queued: 0 };

    // Fetch current week + cursor week (deduplicated)
    const datesToFetch = [today];
    // Only add cursor if it's a different week than today
    const sameWeek = Math.abs(cursorDate - today) < 7 * 24 * 60 * 60 * 1000;
    if (!sameWeek) datesToFetch.push(cursorDate);

    const seenIds = new Set();
    const appointments = [];

    for (const date of datesToFetch) {
      let html;
      try {
        html = await fetchScheduleHtml(date);
      } catch (err) {
        if (err.message === 'SESSION_EXPIRED') {
          console.log('[CronSchedule] 🔒 Session rejected by server — clearing cached session');
          await clearSession(supabase);
          await writeCronHealth(supabase, 'schedule', 'success', { action: 'session_cleared', reason: 'session_expired' }, null);
          return res.status(200).json({ ok: true, action: 'session_cleared', reason: 'session_expired' });
        }
        throw err;
      }

      const parsed = parseScheduleHtml(html);
      stats.pagesScanned++;
      console.log(`[CronSchedule] 📋 Found ${parsed.length} appointments on ${date.toDateString()} page`);

      for (const appt of parsed) {
        if (seenIds.has(appt.id)) continue;
        seenIds.add(appt.id);
        appointments.push(appt);
      }
    }

    stats.found = appointments.length;

    // Filter and enqueue boarding candidates
    for (const appt of appointments) {
      const titleLower = (appt.title || '').toLowerCase().trim();
      const isNonBoarding = NON_BOARDING_RE.some(re => re.test(titleLower));

      if (isNonBoarding) {
        stats.skipped++;
        continue;
      }

      try {
        await enqueue(supabase, {
          external_id: appt.id,
          source_url: appt.url,
          title: appt.title || appt.petName || '',
          meta: appt.petIds?.[0] ? { external_pet_id: appt.petIds[0] } : {},
        });
        stats.queued++;
      } catch (err) {
        // Log but don't fail the whole run for one enqueue error
        console.error(`[CronSchedule] ⚠️ Failed to enqueue ${appt.id}:`, err.message);
      }
    }

    console.log(`[CronSchedule] 🐕 ${stats.found} found, ${stats.skipped} skipped (non-boarding), ${stats.queued} queued`);

    // Advance cursor
    const nextCursor = advanceCursor(cursorDate);
    await saveCursorDate(supabase, nextCursor);
    const wrapped = nextCursor <= today;
    if (wrapped) {
      console.log('[CronSchedule] 🔄 Cursor wrapped back to today');
    } else {
      console.log(`[CronSchedule] ➡️ Cursor advanced to ${nextCursor.toDateString()}`);
    }

    const depth = await getQueueDepth(supabase);
    console.log(`[CronSchedule] 📊 Queue depth after scan: ${depth} pending`);

    const healthResult = {
      pagesScanned: stats.pagesScanned,
      found: stats.found,
      skipped: stats.skipped,
      queued: stats.queued,
      cursorAdvancedTo: nextCursor.toISOString().slice(0, 10),
      queueDepth: depth,
    };
    await writeCronHealth(supabase, 'schedule', 'success', healthResult, null);

    return res.status(200).json({ ok: true, ...healthResult });
  } catch (err) {
    console.error('[CronSchedule] ❌ Unhandled error:', err.message, err.stack);
    try {
      const supabase = getSupabase();
      await writeCronHealth(supabase, 'schedule', 'failure', null, err.message.slice(0, 500));
    } catch { /* ignore */ }
    return res.status(500).json({ error: err.message });
  }
}
