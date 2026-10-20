/**
 * Sync queue — manages the detail-fetch queue for micro-sync mode.
 *
 * cron-schedule enqueues appointments found on schedule pages.
 * cron-detail dequeues them one at a time and fetches the detail page.
 *
 * Retry strategy: up to 3 attempts with exponential backoff (5m, 10m, 15m).
 * Items stuck in 'processing' for >10 minutes are reset to 'pending'.
 *
 * @requirements REQ-109
 */

import { syncLogger } from './logger.js';

const log = syncLogger.log;
const logError = syncLogger.error;

const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes per retry_count

/**
 * Add an item to the queue.
 *
 * Skips silently if the item is already pending or processing.
 * Re-queues items that have permanently failed (status = 'failed').
 *
 * A `done` appointment is re-queued when the schedule shows it was edited (B-3, #205, #278):
 *   - its title changed (both trimmed and non-empty), or
 *   - its URL timestamp changed, unless the detail step skipped it (`meta.detail_skip`).
 * AGYD gives a stay one timestamp (its start), but a recurring daycare or playgroup series one per
 * occurrence, so which one a scan sees first changes with the date and the cursor week. Those are
 * exactly the items the detail step skips, so their URL changes aren't edits.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ external_id: string, source_url: string, title?: string, type?: string, meta?: Object, resetIfDone?: boolean }} item
 * @returns {Promise<'queued'|'requeued_edited'|'requeued'|'url_change_ignored'|'unchanged'>}
 */
export async function enqueue(supabase, { external_id, source_url, title, type = 'appointment', meta = {}, resetIfDone = false }) {
  const { data: existing, error: fetchError } = await supabase
    .from('sync_queue')
    .select('id, status, source_url, title, meta')
    .eq('external_id', external_id)
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    // Check before the shouldReset gate so an edited done item is caught without requiring resetIfDone.
    if (existing.status === 'done' && !resetIfDone) {
      const edit = describeEdit(existing, { external_id, source_url, title });
      if (edit === 'url_change_ignored') return edit;
      if (edit) {
        const { error } = await supabase
          .from('sync_queue')
          .update(requeueFields(existing, { source_url, title, type, meta }))
          .eq('id', existing.id);
        if (error) throw error;
        log(`[SyncQueue] 🔄 Re-queued edited appointment: ${external_id} (${edit})`);
        return 'requeued_edited';
      }
    }

    // Don't disturb in-flight items — log the mismatch so it's auditable but take no action
    if ((existing.status === 'pending' || existing.status === 'processing') &&
        existing.source_url !== null && source_url !== existing.source_url) {
      log(`[SyncQueue] ℹ️ URL mismatch for in-flight item ${external_id} (status: ${existing.status}) — not re-queuing`);
    }

    const shouldReset =
      (existing.status === 'failed') ||
      (existing.status === 'done' && resetIfDone);

    if (!shouldReset) {
      log(`[SyncQueue] ⏭️ Already queued: ${external_id} (status: ${existing.status}, url: ${existing.source_url})`);
      return 'unchanged';
    }
    // Re-queue a failed item, or a done item when the caller confirmed the result isn't stored yet
    const update = existing.status === 'failed'
      ? requeueFields(existing, { source_url, title, type, meta })
      : { status: 'pending', retry_count: 0, last_error: null, next_retry_at: null, queued_at: new Date().toISOString(), type, meta };
    const { error } = await supabase
      .from('sync_queue')
      .update(update)
      .eq('id', existing.id);
    if (error) throw error;
    log(`[SyncQueue] 🔄 Re-queued ${existing.status} item: ${external_id}`);
    return 'requeued';
  }

  const { error } = await supabase
    .from('sync_queue')
    .insert({ external_id, source_url, title, status: 'pending', type, meta });
  // 23505: another scan (cron-schedule and an Integration Check can overlap) queued it first.
  if (error?.code === '23505') {
    log(`[SyncQueue] ⏭️ Already queued by a concurrent scan: ${external_id}`);
    return 'unchanged';
  }
  if (error) throw error;
  log(`[SyncQueue] 📥 Queued: ${external_id} (type=${type})`);
  return 'queued';
}

/**
 * The update that puts an appointment back to pending with what the scan just saw.
 * Meta is merged so a stored `external_pet_id` survives a scan copy without one, and `detail_skip`
 * is dropped so the next detail result decides again. A blank incoming title never replaces a stored one.
 */
function requeueFields(existing, { source_url, title, type, meta }) {
  const merged = { ...(existing.meta || {}), ...meta };
  delete merged.detail_skip;
  const fields = {
    status: 'pending',
    retry_count: 0,
    last_error: null,
    next_retry_at: null,
    queued_at: new Date().toISOString(),
    source_url,
    type,
    meta: merged,
  };
  if ((title || '').trim()) fields.title = title;
  return fields;
}

/**
 * Why a done item counts as edited: a reason string, 'url_change_ignored', or null (not edited).
 * @param {{ source_url: string|null, title: string|null, meta: Object|null }} existing
 * @param {{ external_id: string, source_url: string, title?: string }} incoming
 */
function describeEdit(existing, { external_id, source_url, title }) {
  const oldTitle = (existing.title || '').trim();
  const newTitle = (title || '').trim();
  if (oldTitle && newTitle && oldTitle !== newTitle) return `title changed: "${oldTitle}" → "${newTitle}"`;

  if (existing.source_url === null) {
    log(`[SyncQueue] ⚠️ Can't compare URL for ${external_id} — source_url null, skipping modification check`);
    return null;
  }
  const incomingTs = source_url.match(/\/(\d+)$/);
  if (!incomingTs) {
    log(`[SyncQueue] ⚠️ Incoming URL has no timestamp for ${external_id} — skipping modification check`);
    return null;
  }
  if (source_url === existing.source_url) return null;

  const oldTsMatch = existing.source_url.match(/\/(\d+)$/);
  const oldTs = oldTsMatch ? oldTsMatch[1] : '?';
  const newTs = incomingTs[1];
  const oldIso = oldTs !== '?' ? new Date(parseInt(oldTs, 10) * 1000).toISOString().slice(0, 10) : '?';
  const newIso = new Date(parseInt(newTs, 10) * 1000).toISOString().slice(0, 10);
  const change = `url changed: /${oldTs} [${oldIso}] → /${newTs} [${newIso}]`;

  const skipReason = existing.meta?.detail_skip;
  if (skipReason) {
    log(`[SyncQueue] ⏭️ Not re-queuing ${external_id}: ${change}, but the detail step skipped it (${skipReason})`);
    return 'url_change_ignored';
  }
  return change;
}

/**
 * Dequeue the oldest pending item and mark it as 'processing'.
 * Respects next_retry_at — items with a future retry time are skipped.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ type?: string }} [options] - optional filter by item type
 * @returns {Promise<Object|null>} queue row or null if nothing ready
 */
export async function dequeueOne(supabase, { type } = {}) {
  const now = new Date().toISOString();

  let query = supabase
    .from('sync_queue')
    .select('*')
    .eq('status', 'pending')
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('queued_at', { ascending: true })
    .limit(1);

  if (type) query = query.eq('type', type);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Optimistic lock: only update if still pending (prevents double-dequeue)
  const { error: updateError } = await supabase
    .from('sync_queue')
    .update({ status: 'processing', processing_started_at: now })
    .eq('id', data.id)
    .eq('status', 'pending');

  if (updateError) throw updateError;

  return { ...data, status: 'processing', processing_started_at: now };
}

/**
 * Mark a queue item as successfully processed.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id - queue row UUID
 * @param {{ meta?: Object }} [options] - `meta` replaces the row's meta (the detail step records `detail_skip` here)
 * @returns {Promise<void>}
 */
export async function markDone(supabase, id, { meta } = {}) {
  const update = { status: 'done', processed_at: new Date().toISOString() };
  if (meta) update.meta = meta;
  const { error } = await supabase
    .from('sync_queue')
    .update(update)
    .eq('id', id);
  if (error) throw error;
  log(`[SyncQueue] ✅ Marked done: ${id}`);
}

/**
 * Mark a queue item as failed and schedule a retry with backoff.
 * After MAX_RETRIES attempts the item is permanently failed.
 *
 * Backoff: next_retry_at = now + (retry_count × 5 minutes)
 *   retry 1 → +5m, retry 2 → +10m, retry 3 → permanent failure
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id - queue row UUID
 * @param {string} errorMessage
 * @returns {Promise<void>}
 */
export async function markFailed(supabase, id, errorMessage) {
  const { data, error: fetchError } = await supabase
    .from('sync_queue')
    .select('retry_count')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const retryCount = (data?.retry_count ?? 0) + 1;

  if (retryCount >= MAX_RETRIES) {
    const { error } = await supabase
      .from('sync_queue')
      .update({
        status: 'failed',
        retry_count: retryCount,
        last_error: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    logError(`[SyncQueue] ⛔ Item permanently failed after ${retryCount} retries: ${id} — ${errorMessage}`);
  } else {
    const nextRetryAt = new Date(Date.now() + retryCount * RETRY_INTERVAL_MS).toISOString();
    const { error } = await supabase
      .from('sync_queue')
      .update({
        status: 'pending',
        retry_count: retryCount,
        last_error: errorMessage,
        next_retry_at: nextRetryAt,
      })
      .eq('id', id);
    if (error) throw error;
    log(`[SyncQueue] 🔄 Retry ${retryCount}/${MAX_RETRIES - 1} scheduled at ${nextRetryAt}: ${id}`);
  }
}

/**
 * Reset items that have been stuck in 'processing' for more than 10 minutes.
 * Called at the start of every cron-detail run.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number>} count of items reset
 */
export async function resetStuck(supabase) {
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: stuckItems, error: fetchError } = await supabase
    .from('sync_queue')
    .select('id, external_id, processing_started_at')
    .eq('status', 'processing')
    .lt('processing_started_at', stuckCutoff);

  if (fetchError) throw fetchError;
  if (!stuckItems || stuckItems.length === 0) return 0;

  for (const item of stuckItems) {
    const ageMin = Math.round(
      (Date.now() - new Date(item.processing_started_at).getTime()) / 60000
    );
    log(`[SyncQueue] ⚠️ Stuck item reset to pending: ${item.external_id} (processing for ${ageMin}min)`);
    await supabase
      .from('sync_queue')
      .update({ status: 'pending', processing_started_at: null })
      .eq('id', item.id);
  }

  return stuckItems.length;
}

/**
 * Count items currently in the queue (pending + processing).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number>}
 */
export async function getQueueDepth(supabase) {
  const { count, error } = await supabase
    .from('sync_queue')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'processing']);

  if (error) throw error;
  return count ?? 0;
}

export default { enqueue, dequeueOne, markDone, markFailed, resetStuck, getQueueDepth };
