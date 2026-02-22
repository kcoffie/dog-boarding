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
 * Add an appointment to the queue.
 *
 * Skips silently if the item is already pending, processing, or done.
 * Re-queues items that have permanently failed (status = 'failed').
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ external_id: string, source_url: string, title?: string }} item
 * @returns {Promise<void>}
 */
export async function enqueue(supabase, { external_id, source_url, title }) {
  const { data: existing, error: fetchError } = await supabase
    .from('sync_queue')
    .select('id, status')
    .eq('external_id', external_id)
    .limit(1)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

  if (existing) {
    if (existing.status !== 'failed') {
      log(`[SyncQueue] ⏭️ Already queued: ${external_id} (status: ${existing.status})`);
      return;
    }
    // Re-queue a permanently-failed item
    const { error } = await supabase
      .from('sync_queue')
      .update({
        status: 'pending',
        retry_count: 0,
        last_error: null,
        next_retry_at: null,
        queued_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw error;
    log(`[SyncQueue] 🔄 Re-queued failed item: ${external_id}`);
    return;
  }

  const { error } = await supabase
    .from('sync_queue')
    .insert({ external_id, source_url, title, status: 'pending' });
  if (error) throw error;
  log(`[SyncQueue] 📥 Queued: ${external_id}`);
}

/**
 * Dequeue the oldest pending item and mark it as 'processing'.
 * Respects next_retry_at — items with a future retry time are skipped.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Object|null>} queue row or null if nothing ready
 */
export async function dequeueOne(supabase) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('sync_queue')
    .select('*')
    .eq('status', 'pending')
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('queued_at', { ascending: true })
    .limit(1)
    .single();

  if (error && error.code === 'PGRST116') return null; // no rows ready
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
 * @returns {Promise<void>}
 */
export async function markDone(supabase, id) {
  const { error } = await supabase
    .from('sync_queue')
    .update({ status: 'done', processed_at: new Date().toISOString() })
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
    .single();

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
