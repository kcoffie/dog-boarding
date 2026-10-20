/**
 * Intraday boarding change notification — sends a delta image when overnight
 * boarders tonight have changed since the 8:30am baseline. It goes to staff only,
 * so it is off while ROSTER_CHANNEL is telegram (Kate only, REQ-655).
 *
 * GET /api/notify-intraday?token=SECRET
 *
 * Called by a GitHub Actions workflow hourly from 9am–8pm PDT Mon–Fri.
 * Skip logic (no send):
 *   - No 8:30am snapshot for today
 *   - Delta is empty (no changes since 8:30am)
 *   - Delta hash matches last intraday send (nothing new since last hourly send)
 *
 * State: cron_health rows
 *   'boarders-snapshot'  — written by notify.js at 8:30am; read here
 *   'notify-intraday'    — written here after each send; read for delta hash gate
 *
 * @requirements REQ-J1, REQ-655
 */

import { createClient } from '@supabase/supabase-js';
import { queryBoarders } from '../src/lib/pictureOfDay.js';
import { readRosterChannel, intradayEnabled, fetchRosterPng, sendRoster } from '../src/lib/rosterChannel.js';
import { recordMessageLog } from '../src/lib/messageDeliveryStatus.js';
import { writeCronHealth } from './_cronHealth.js';

export const config = { runtime: 'nodejs' };

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Compute the intraday delta between the 8:30am snapshot and current boarders.
 * Added = in current but not in snapshot. Cancelled = in snapshot but not in current.
 * Comparison is by name — the stable identifier across boarding rows.
 *
 * @param {Array<{name: string, arrival_datetime: string, departure_datetime: string}>} snapshotBoarders
 * @param {Array<{name: string, arrival_datetime: string, departure_datetime: string}>} currentBoarders
 * @returns {{ added: typeof snapshotBoarders, cancelled: typeof snapshotBoarders }}
 */
export function computeIntradayDelta(snapshotBoarders, currentBoarders) {
  const snapshotNames = new Set(snapshotBoarders.map(b => b.name));
  const currentNames = new Set(currentBoarders.map(b => b.name));
  const added = currentBoarders.filter(b => !snapshotNames.has(b.name));
  const cancelled = snapshotBoarders.filter(b => !currentNames.has(b.name));
  return { added, cancelled };
}

/**
 * Compute a stable hash of a delta for send-gate comparison.
 * djb2 over sorted names — avoids resending when nothing new changed since the
 * last hourly send even though the cumulative delta remains non-empty.
 *
 * @param {Array} added
 * @param {Array} cancelled
 * @returns {string}
 */
export function hashDelta(added, cancelled) {
  const key = JSON.stringify({
    added: added.map(b => b.name).sort(),
    cancelled: cancelled.map(b => b.name).sort(),
  });
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

/**
 * Read the 8:30am boarders snapshot from cron_health.
 * Returns null if no snapshot row exists or the snapshot is for a different date
 * (stale row from a prior day must not be used as today's baseline).
 *
 * Error-handling: returns null on DB error so the caller can skip with reason 'no_snapshot'.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} todayStr - YYYY-MM-DD
 * @returns {Promise<{snapshotDate: string, boarders: Array, capturedAt: string}|null>}
 */
async function readBoardersSnapshot(supabase, todayStr) {
  const { data, error } = await supabase
    .from('cron_health')
    .select('result')
    .eq('cron_name', 'boarders-snapshot')
    .maybeSingle();

  if (error) {
    console.warn(`[NotifyIntraday] Could not read boarders snapshot: ${error.message}`);
    return null;
  }

  if (!data?.result) return null;

  if (data.result.snapshotDate !== todayStr) {
    console.log(`[NotifyIntraday] Snapshot date mismatch: found ${data.result.snapshotDate}, today is ${todayStr} — treating as no snapshot`);
    return null;
  }

  return data.result;
}

/**
 * Read the last intraday send state from cron_health.
 * Returns { lastDeltaHash, lastDate } or null if no prior send today.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{lastDeltaHash: string, lastDate: string}|null>}
 */
async function readLastIntradayState(supabase) {
  const { data, error } = await supabase
    .from('cron_health')
    .select('result')
    .eq('cron_name', 'notify-intraday')
    .maybeSingle();

  if (error) {
    console.warn(`[NotifyIntraday] Could not read last intraday state: ${error.message} — proceeding without baseline`);
    return null;
  }

  if (!data?.result?.lastDeltaHash) return null;

  return {
    lastDeltaHash: data.result.lastDeltaHash,
    lastDate: data.result.lastDate || '',
  };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const providedToken = req.query.token || '';
  const expectedToken = process.env.VITE_SYNC_PROXY_TOKEN || '';
  if (!expectedToken || providedToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // --- Channel: required, checked before any work ---
  const { channel, error: channelError } = readRosterChannel(process.env.ROSTER_CHANNEL);
  if (channelError) {
    console.error(`[NotifyIntraday] ${channelError}`);
    try {
      await writeCronHealth(getSupabase(), 'notify-intraday', 'failure', null, channelError);
    } catch { /* ignore — the 500 below is the signal */ }
    return res.status(500).json({ error: channelError });
  }
  if (!intradayEnabled(channel)) {
    console.log(`[NotifyIntraday] Off while ROSTER_CHANNEL is ${channel} (Kate only) — skipping`);
    return res.status(200).json({ ok: true, action: 'skipped', reason: `channel_${channel}` });
  }

  const jobRunAt = new Date().toISOString();

  // Compute today's date in Pacific time — same pattern as notify.js.
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date());

  console.log(`[NotifyIntraday] Entry — date: ${todayStr}, run at: ${jobRunAt}`);

  try {
    const supabase = getSupabase();

    // --- Load 8:30am snapshot ---
    const snapshot = await readBoardersSnapshot(supabase, todayStr);
    if (!snapshot) {
      console.log(`[NotifyIntraday] No snapshot for today (${todayStr}) — skipping`);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_snapshot' });
    }
    console.log(`[NotifyIntraday] Snapshot loaded for ${todayStr} — ${snapshot.boarders.length} boarders at 8:30am: [${snapshot.boarders.map(b => b.name).join(', ')}]`);

    // --- Query current boarders ---
    const currentBoarders = await queryBoarders(supabase, todayStr);
    console.log(`[NotifyIntraday] Current boarders: ${currentBoarders.length} — [${currentBoarders.map(b => b.name).join(', ')}]`);

    // --- Compute delta ---
    const { added, cancelled } = computeIntradayDelta(snapshot.boarders, currentBoarders);
    console.log(`[NotifyIntraday] Delta: ${added.length} added [${added.map(b => b.name).join(', ')}], ${cancelled.length} cancelled [${cancelled.map(b => b.name).join(', ')}]`);

    // --- Hash gate: skip if delta unchanged since last hourly send ---
    const deltaHash = hashDelta(added, cancelled);
    const lastState = await readLastIntradayState(supabase);
    console.log(`[NotifyIntraday] Delta hash: ${deltaHash}. Last state: ${lastState ? `hash ${lastState.lastDeltaHash} on ${lastState.lastDate}` : 'none'}`);

    if (lastState?.lastDate === todayStr && lastState.lastDeltaHash === deltaHash) {
      console.log(`[NotifyIntraday] Delta hash unchanged since last send (${deltaHash}) — skipping`);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'delta_unchanged' });
    }

    // --- Empty delta gate: skip if nothing changed since 8:30am ---
    if (added.length === 0 && cancelled.length === 0) {
      console.log(`[NotifyIntraday] Delta empty (no changes since 8:30am) — skipping`);
      return res.status(200).json({ ok: true, action: 'skipped', reason: 'no_change_since_830am' });
    }

    // --- Construct intraday image URL ---
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const imageUrl = `${protocol}://${host}/api/intraday-image?date=${todayStr}&token=${expectedToken}&ts=${encodeURIComponent(jobRunAt)}`;
    console.log(`[NotifyIntraday] Image URL: ${protocol}://${host}/api/intraday-image?date=${todayStr}&token=***&ts=${encodeURIComponent(jobRunAt)}`);

    // --- Render once, store, send the same bytes ---
    const png = await fetchRosterPng(imageUrl);
    let imagePath = null;
    try {
      const safeTs = jobRunAt.replace(/:/g, '-');
      const pathInBucket = `notify-intraday/${safeTs}.png`;
      const { error: uploadErr } = await supabase.storage
        .from('roster-images')
        .upload(pathInBucket, png, { contentType: 'image/png', upsert: true });
      if (!uploadErr) {
        imagePath = `roster-images/${pathInBucket}`;
        console.log(`[NotifyIntraday] Image stored at ${imagePath}`);
      } else {
        console.warn(`[NotifyIntraday] Image upload failed: ${uploadErr.message}`);
      }
    } catch (err) {
      console.warn(`[NotifyIntraday] Image store error: ${err.message}`);
    }

    console.log(`[NotifyIntraday] Sending on ${channel} — added: ${added.length}, cancelled: ${cancelled.length}`);
    const sendResults = await sendRoster({ channel, png, caption: 'Roster update' });

    await recordMessageLog(supabase, sendResults, 'notify-intraday', 'image', null, imagePath).catch(err =>
      console.warn(`[NotifyIntraday] Failed to record message_log: ${err.message}`)
    );

    // A send that reached no one fails the run before the hash is stored, so the next hour retries (#255).
    if (!sendResults.some(r => r.status === 'sent')) {
      const why = sendResults.map(r => r.error).filter(Boolean).join('; ');
      throw new Error(`No recipient received the roster update${why ? `: ${why}` : ''}`);
    }

    // --- Persist intraday state ---
    await writeCronHealth(supabase, 'notify-intraday', 'success', {
      lastDeltaHash: deltaHash,
      lastDate: todayStr,
      sentAt: new Date().toISOString(),
      addedCount: added.length,
      cancelledCount: cancelled.length,
      recipients: sendResults.map(r => r.to),
    }, null);

    const sentCount = sendResults.filter(r => r.status === 'sent').length;
    const failedCount = sendResults.filter(r => r.status === 'failed').length;
    console.log(`[NotifyIntraday] Complete — ${sentCount} sent, ${failedCount} failed. Added: ${added.length}, Cancelled: ${cancelled.length}`);

    return res.status(200).json({
      ok: true,
      action: 'sent',
      addedCount: added.length,
      cancelledCount: cancelled.length,
      sentCount,
      failedCount,
    });

  } catch (err) {
    console.error('[NotifyIntraday] ❌ Unhandled error:', err.message, err.stack);
    try {
      const supabase = getSupabase();
      await writeCronHealth(supabase, 'notify-intraday', 'failure', null, err.message.slice(0, 500));
    } catch { /* ignore — health write failure should not mask the original error */ }
    return res.status(500).json({ error: err.message });
  }
}
