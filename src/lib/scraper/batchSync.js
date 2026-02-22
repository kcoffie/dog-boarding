/**
 * Batch Sync - Process syncs in small daily batches with checkpoints
 * Solves the session timeout problem by:
 * 1. Processing one day at a time
 * 2. Saving checkpoint after each day
 * 3. Re-authenticating between batches if needed
 * 4. Resuming from checkpoint on failure
 */

import { createClient } from '@supabase/supabase-js';
import { runSync, SyncStatus } from './sync.js';
import { clearSession } from './auth.js';
import { syncLogger } from './logger.js';

const log = syncLogger.log;
const error = syncLogger.error;

/**
 * Get Supabase client
 */
function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase URL and key required');
  return createClient(url, key);
}

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Split a date range into daily batches
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array<{start: Date, end: Date, index: number}>}
 */
export function splitIntoDays(startDate, endDate) {
  const batches = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  let index = 0;
  while (current <= end) {
    const dayStart = new Date(current);
    const dayEnd = new Date(current);
    dayEnd.setHours(23, 59, 59, 999);

    batches.push({
      start: dayStart,
      end: dayEnd,
      index: index++,
    });

    current.setDate(current.getDate() + 1);
  }

  return batches;
}

/**
 * Load active checkpoint for a sync type
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} syncType
 * @returns {Promise<Object|null>}
 */
export async function loadCheckpoint(supabase, syncType = 'historical') {
  const { data, error: err } = await supabase
    .from('sync_checkpoints')
    .select('*')
    .eq('sync_type', syncType)
    .in('status', ['in_progress', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (err && err.code !== 'PGRST116') { // PGRST116 = no rows
    throw err;
  }

  return data || null;
}

/**
 * Create a new checkpoint
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} checkpoint
 * @returns {Promise<Object>}
 */
export async function createCheckpoint(supabase, checkpoint) {
  const { data, error: err } = await supabase
    .from('sync_checkpoints')
    .insert({
      sync_type: checkpoint.syncType || 'historical',
      target_start_date: checkpoint.targetStartDate,
      target_end_date: checkpoint.targetEndDate,
      total_batches: checkpoint.totalBatches || 0,
      status: 'in_progress',
    })
    .select()
    .single();

  if (err) throw err;
  return data;
}

/**
 * Update checkpoint progress
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} checkpointId
 * @param {Object} updates
 */
export async function updateCheckpoint(supabase, checkpointId, updates) {
  const { error: err } = await supabase
    .from('sync_checkpoints')
    .update({
      ...updates,
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', checkpointId);

  if (err) throw err;
}

/**
 * Run a batch sync with checkpoints
 * @param {Object} options
 * @param {Date} options.startDate - Start of date range
 * @param {Date} options.endDate - End of date range
 * @param {string} [options.syncType='historical'] - Type of sync
 * @param {number} [options.delayBetweenBatches=3000] - Delay in ms between batches
 * @param {boolean} [options.forceReauth=true] - Force re-authentication between batches
 * @param {Function} [options.onProgress] - Progress callback
 * @param {Function} [options.onBatchComplete] - Called after each batch completes
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>} Overall sync results
 */
export async function runBatchSync(options = {}) {
  const {
    startDate,
    endDate,
    syncType = 'historical',
    delayBetweenBatches = 3000,
    forceReauth = true,
    onProgress,
    onBatchComplete,
    supabase = getSupabaseClient(),
  } = options;

  const overallStartTime = Date.now();

  log('═══════════════════════════════════════════════════════════════');
  log(`BATCH SYNC STARTED - Type: ${syncType}`);
  log(`Target range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  log('═══════════════════════════════════════════════════════════════');

  const result = {
    success: false,
    status: 'failed',
    totalBatches: 0,
    batchesCompleted: 0,
    batchesFailed: 0,
    totalAppointmentsFound: 0,
    totalAppointmentsCreated: 0,
    totalAppointmentsUpdated: 0,
    totalAppointmentsUnchanged: 0,
    totalAppointmentsFailed: 0,
    errors: [],
    durationMs: 0,
    checkpointId: null,
  };

  try {
    // Check for existing checkpoint to resume
    let checkpoint = await loadCheckpoint(supabase, syncType);
    let effectiveStartDate = startDate;

    if (checkpoint) {
      log(`📋 Found existing checkpoint: ${checkpoint.id}`);
      log(`   Last completed date: ${checkpoint.last_completed_date || 'none'}`);
      log(`   Progress: ${checkpoint.batches_completed}/${checkpoint.total_batches} batches`);

      // Resume from day after last completed
      if (checkpoint.last_completed_date) {
        effectiveStartDate = new Date(checkpoint.last_completed_date);
        effectiveStartDate.setDate(effectiveStartDate.getDate() + 1);
        log(`   Resuming from: ${effectiveStartDate.toISOString().split('T')[0]}`);
      }

      // Update checkpoint status
      await updateCheckpoint(supabase, checkpoint.id, { status: 'in_progress' });
    } else {
      // Create new checkpoint
      const batches = splitIntoDays(startDate, endDate);
      checkpoint = await createCheckpoint(supabase, {
        syncType,
        targetStartDate: startDate.toISOString().split('T')[0],
        targetEndDate: endDate.toISOString().split('T')[0],
        totalBatches: batches.length,
      });
      log(`📋 Created new checkpoint: ${checkpoint.id}`);
    }

    result.checkpointId = checkpoint.id;

    // Split remaining date range into batches
    const batches = splitIntoDays(effectiveStartDate, endDate);
    result.totalBatches = batches.length;

    if (batches.length === 0) {
      log('✅ No batches to process - sync already complete');
      await updateCheckpoint(supabase, checkpoint.id, { status: 'completed' });
      result.success = true;
      result.status = 'completed';
      return result;
    }

    log(`📦 Processing ${batches.length} daily batches`);
    log('───────────────────────────────────────────────────────────────');

    onProgress?.({
      stage: 'batch_sync_started',
      totalBatches: batches.length,
      checkpointId: checkpoint.id,
    });

    // Process each batch
    for (const batch of batches) {
      const batchStartTime = Date.now();
      const batchDateStr = batch.start.toISOString().split('T')[0];

      log(`\n📅 BATCH ${batch.index + 1}/${batches.length}: ${batchDateStr}`);

      try {
        // Force re-authentication before each batch to avoid session expiry
        if (forceReauth && batch.index > 0) {
          log('   🔄 Clearing session for fresh authentication...');
          clearSession();
        }

        onProgress?.({
          stage: 'batch_starting',
          batchIndex: batch.index,
          totalBatches: batches.length,
          date: batchDateStr,
        });

        // Run sync for this single day
        const batchResult = await runSync({
          startDate: batch.start,
          endDate: batch.end,
          supabase,
          onProgress: (progress) => {
            onProgress?.({
              ...progress,
              batchIndex: batch.index,
              totalBatches: batches.length,
              batchDate: batchDateStr,
            });
          },
        });

        const batchDuration = Date.now() - batchStartTime;

        // Accumulate results
        result.batchesCompleted++;
        result.totalAppointmentsFound += batchResult.appointmentsFound;
        result.totalAppointmentsCreated += batchResult.appointmentsCreated;
        result.totalAppointmentsUpdated += batchResult.appointmentsUpdated;
        result.totalAppointmentsUnchanged += batchResult.appointmentsUnchanged;
        result.totalAppointmentsFailed += batchResult.appointmentsFailed;

        log(`   ✅ Batch complete: ${batchResult.appointmentsFound} found, ${batchResult.appointmentsCreated} created, ${batchResult.appointmentsUpdated} updated (${batchDuration}ms)`);

        // Save checkpoint
        await updateCheckpoint(supabase, checkpoint.id, {
          last_completed_date: batchDateStr,
          batches_completed: (checkpoint.batches_completed || 0) + result.batchesCompleted,
          total_appointments_processed: (checkpoint.total_appointments_processed || 0) + batchResult.appointmentsFound,
        });

        log(`   💾 Checkpoint saved: ${batchDateStr}`);

        onBatchComplete?.({
          batchIndex: batch.index,
          totalBatches: batches.length,
          date: batchDateStr,
          result: batchResult,
          duration: batchDuration,
        });

        onProgress?.({
          stage: 'batch_completed',
          batchIndex: batch.index,
          totalBatches: batches.length,
          date: batchDateStr,
          batchResult,
        });

        // Delay before next batch (unless it's the last one)
        if (batch.index < batches.length - 1) {
          log(`   ⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
          await delay(delayBetweenBatches);
        }

      } catch (batchError) {
        result.batchesFailed++;
        const errorMsg = batchError.message || 'Unknown batch error';
        result.errors.push({
          batch: batch.index,
          date: batchDateStr,
          error: errorMsg,
        });

        error(`   ❌ Batch failed: ${errorMsg}`);

        // Update checkpoint with error
        await updateCheckpoint(supabase, checkpoint.id, {
          status: 'paused',
          error_message: `Failed on ${batchDateStr}: ${errorMsg}`,
        });

        onProgress?.({
          stage: 'batch_failed',
          batchIndex: batch.index,
          totalBatches: batches.length,
          date: batchDateStr,
          error: errorMsg,
        });

        // Stop processing on failure - user can resume later
        log(`\n⛔ Stopping batch sync due to error. Resume will continue from ${batchDateStr}`);
        break;
      }
    }

    // Determine final status
    result.durationMs = Date.now() - overallStartTime;

    if (result.batchesFailed === 0 && result.batchesCompleted === batches.length) {
      result.success = true;
      result.status = 'completed';
      await updateCheckpoint(supabase, checkpoint.id, { status: 'completed' });
    } else if (result.batchesCompleted > 0) {
      result.success = false;
      result.status = 'partial';
      // Checkpoint already marked as paused
    } else {
      result.success = false;
      result.status = 'failed';
      await updateCheckpoint(supabase, checkpoint.id, { status: 'failed' });
    }

  } catch (err) {
    result.durationMs = Date.now() - overallStartTime;
    result.errors.push({ error: err.message });
    error(`💥 Batch sync error: ${err.message}`);

    onProgress?.({
      stage: 'batch_sync_failed',
      error: err.message,
    });
  }

  // Final summary
  log('\n═══════════════════════════════════════════════════════════════');
  log(`BATCH SYNC ${result.status.toUpperCase()}`);
  log(`📊 Batches: ${result.batchesCompleted}/${result.totalBatches} completed, ${result.batchesFailed} failed`);
  log(`📋 Appointments: ${result.totalAppointmentsFound} found, ${result.totalAppointmentsCreated} created, ${result.totalAppointmentsUpdated} updated, ${result.totalAppointmentsUnchanged} unchanged`);
  log(`⏱️ Duration: ${result.durationMs}ms (${(result.durationMs / 1000 / 60).toFixed(1)} min)`);
  log('═══════════════════════════════════════════════════════════════');

  onProgress?.({
    stage: 'batch_sync_completed',
    result,
  });

  return result;
}

/**
 * Get status of current batch sync
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase]
 * @param {string} [syncType='historical']
 * @returns {Promise<Object|null>}
 */
export async function getBatchSyncStatus(supabase = getSupabaseClient(), syncType = 'historical') {
  const checkpoint = await loadCheckpoint(supabase, syncType);

  if (!checkpoint) {
    return null;
  }

  const targetStart = new Date(checkpoint.target_start_date);
  const targetEnd = new Date(checkpoint.target_end_date);
  const totalDays = Math.ceil((targetEnd - targetStart) / (24 * 60 * 60 * 1000)) + 1;

  let daysSynced = 0;
  if (checkpoint.last_completed_date) {
    const lastCompleted = new Date(checkpoint.last_completed_date);
    daysSynced = Math.ceil((lastCompleted - targetStart) / (24 * 60 * 60 * 1000)) + 1;
  }

  const progressPercent = totalDays > 0 ? ((daysSynced / totalDays) * 100).toFixed(1) : 0;

  return {
    checkpointId: checkpoint.id,
    syncType: checkpoint.sync_type,
    status: checkpoint.status,
    targetStartDate: checkpoint.target_start_date,
    targetEndDate: checkpoint.target_end_date,
    lastCompletedDate: checkpoint.last_completed_date,
    totalDays,
    daysSynced,
    progressPercent,
    totalAppointmentsProcessed: checkpoint.total_appointments_processed || 0,
    startedAt: checkpoint.started_at,
    lastRunAt: checkpoint.last_run_at,
    errorMessage: checkpoint.error_message,
    isComplete: checkpoint.status === 'completed',
    canResume: checkpoint.status === 'paused' || checkpoint.status === 'in_progress',
  };
}

/**
 * Resume a paused batch sync
 * @param {Object} options
 * @param {string} [options.syncType='historical']
 * @param {Function} [options.onProgress]
 * @param {Function} [options.onBatchComplete]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>}
 */
export async function resumeBatchSync(options = {}) {
  const {
    syncType = 'historical',
    onProgress,
    onBatchComplete,
    supabase = getSupabaseClient(),
  } = options;

  const checkpoint = await loadCheckpoint(supabase, syncType);

  if (!checkpoint) {
    throw new Error(`No checkpoint found for sync type: ${syncType}`);
  }

  if (checkpoint.status === 'completed') {
    throw new Error('Checkpoint already completed. Start a new batch sync instead.');
  }

  log(`📋 Resuming batch sync from checkpoint: ${checkpoint.id}`);

  return runBatchSync({
    startDate: new Date(checkpoint.target_start_date),
    endDate: new Date(checkpoint.target_end_date),
    syncType,
    onProgress,
    onBatchComplete,
    supabase,
  });
}

/**
 * Cancel/reset a batch sync checkpoint
 * @param {string} [syncType='historical']
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase]
 */
export async function cancelBatchSync(syncType = 'historical', supabase = getSupabaseClient()) {
  const { error: err } = await supabase
    .from('sync_checkpoints')
    .update({
      status: 'failed',
      error_message: 'Cancelled by user',
      updated_at: new Date().toISOString(),
    })
    .eq('sync_type', syncType)
    .in('status', ['in_progress', 'paused']);

  if (err) throw err;
  log(`🛑 Cancelled batch sync for type: ${syncType}`);
}

export default {
  splitIntoDays,
  loadCheckpoint,
  createCheckpoint,
  updateCheckpoint,
  runBatchSync,
  getBatchSyncStatus,
  resumeBatchSync,
  cancelBatchSync,
};
