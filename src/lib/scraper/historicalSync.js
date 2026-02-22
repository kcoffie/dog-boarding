/**
 * Historical sync module - handles importing historical data in batches
 * @requirements REQ-216, REQ-217, REQ-218
 */

import { runSync, updateSyncLog, createSyncLog, SyncStatus } from './sync.js';
import { createClient } from '@supabase/supabase-js';
import { historicalLogger } from './logger.js';

const log = historicalLogger.log;
const logError = historicalLogger.error;

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
 * Split a date range into batches
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @param {number} batchDays - Days per batch
 * @returns {Array<{start: Date, end: Date, index: number}>}
 */
export function splitDateRange(startDate, endDate, batchDays = 30) {
  const batches = [];
  let currentStart = new Date(startDate);
  let index = 0;

  while (currentStart < endDate) {
    const batchEnd = new Date(currentStart);
    batchEnd.setDate(batchEnd.getDate() + batchDays - 1);

    // Don't exceed the end date
    const actualEnd = batchEnd > endDate ? endDate : batchEnd;

    batches.push({
      start: new Date(currentStart),
      end: new Date(actualEnd),
      index: index++,
    });

    // Move to next batch
    currentStart = new Date(actualEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  return batches;
}

/**
 * Run a historical sync from a start date to present
 * Processes data in batches to avoid overwhelming the system
 * @param {Object} options
 * @param {Date} [options.startDate] - Start date (default: 2024-09-01)
 * @param {Date} [options.endDate] - End date (default: now)
 * @param {number} [options.batchDays=30] - Days per batch
 * @param {Function} [options.onProgress] - Progress callback
 * @param {Function} [options.onBatchComplete] - Called after each batch
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>} Combined results from all batches
 */
export async function runHistoricalSync(options = {}) {
  const {
    startDate = new Date('2024-09-01'),
    endDate = new Date(),
    batchDays = 30,
    onProgress,
    onBatchComplete,
    supabase = getSupabaseClient(),
  } = options;

  const startTime = Date.now();
  const batches = splitDateRange(startDate, endDate, batchDays);

  // Create a master sync log for the historical import
  const masterLog = await createSyncLog(supabase);
  await supabase
    .from('sync_logs')
    .update({ sync_type: 'historical' })
    .eq('id', masterLog.id);

  const results = {
    success: true,
    status: SyncStatus.SUCCESS,
    totalBatches: batches.length,
    completedBatches: 0,
    failedBatches: 0,
    appointmentsFound: 0,
    appointmentsCreated: 0,
    appointmentsUpdated: 0,
    appointmentsUnchanged: 0,
    appointmentsFailed: 0,
    errors: [],
    changeDetails: [],
    batchResults: [],
    durationMs: 0,
  };

  onProgress?.({
    stage: 'historical_started',
    totalBatches: batches.length,
    startDate,
    endDate,
  });

  for (const batch of batches) {
    try {
      onProgress?.({
        stage: 'batch_starting',
        batchIndex: batch.index,
        totalBatches: batches.length,
        batchStart: batch.start,
        batchEnd: batch.end,
      });

      log(`[HistoricalSync] Processing batch ${batch.index + 1}/${batches.length}: ${batch.start.toISOString().split('T')[0]} to ${batch.end.toISOString().split('T')[0]}`);

      const batchResult = await runSync({
        startDate: batch.start,
        endDate: batch.end,
        supabase,
        onProgress: (progress) => {
          onProgress?.({
            ...progress,
            batchIndex: batch.index,
            totalBatches: batches.length,
          });
        },
      });

      // Aggregate results
      results.appointmentsFound += batchResult.appointmentsFound;
      results.appointmentsCreated += batchResult.appointmentsCreated;
      results.appointmentsUpdated += batchResult.appointmentsUpdated;
      results.appointmentsUnchanged += batchResult.appointmentsUnchanged || 0;
      results.appointmentsFailed += batchResult.appointmentsFailed;
      results.errors.push(...batchResult.errors);
      results.changeDetails.push(...(batchResult.changeDetails || []));
      results.completedBatches++;

      results.batchResults.push({
        index: batch.index,
        start: batch.start,
        end: batch.end,
        success: batchResult.success,
        ...batchResult,
      });

      onBatchComplete?.({
        batchIndex: batch.index,
        totalBatches: batches.length,
        batchResult,
        aggregateResults: { ...results },
      });

      log(`[HistoricalSync] Batch ${batch.index + 1} completed: ${batchResult.appointmentsCreated} created, ${batchResult.appointmentsUpdated} updated`);

    } catch (error) {
      logError(`[HistoricalSync] Batch ${batch.index + 1} failed:`, error.message);
      results.failedBatches++;
      results.errors.push({
        batch: batch.index,
        error: error.message,
      });

      results.batchResults.push({
        index: batch.index,
        start: batch.start,
        end: batch.end,
        success: false,
        error: error.message,
      });

      onProgress?.({
        stage: 'batch_failed',
        batchIndex: batch.index,
        error: error.message,
      });

      // Continue with next batch instead of stopping
    }
  }

  // Calculate final duration
  results.durationMs = Date.now() - startTime;

  // Determine final status
  if (results.failedBatches === 0) {
    results.status = SyncStatus.SUCCESS;
  } else if (results.completedBatches > 0) {
    results.status = SyncStatus.PARTIAL;
  } else {
    results.status = SyncStatus.FAILED;
    results.success = false;
  }

  // Update master sync log
  await updateSyncLog(supabase, masterLog.id, {
    status: results.status,
    appointments_found: results.appointmentsFound,
    appointments_created: results.appointmentsCreated,
    appointments_updated: results.appointmentsUpdated,
    appointments_unchanged: results.appointmentsUnchanged,
    appointments_failed: results.appointmentsFailed,
    errors: results.errors.slice(0, 100), // Limit errors stored
    change_details: results.changeDetails.slice(0, 500), // Limit change details
    duration_ms: results.durationMs,
  });

  onProgress?.({
    stage: 'historical_completed',
    results,
  });

  log('[HistoricalSync] ═══════════════════════════════════════════════════');
  log(`[HistoricalSync] HISTORICAL IMPORT COMPLETED - ${results.status.toUpperCase()}`);
  log(`[HistoricalSync] Batches: ${results.completedBatches}/${results.totalBatches} completed`);
  log(`[HistoricalSync] Results: ${results.appointmentsFound} found, ${results.appointmentsCreated} created, ${results.appointmentsUpdated} updated, ${results.appointmentsUnchanged} unchanged, ${results.appointmentsFailed} failed`);
  log(`[HistoricalSync] Duration: ${(results.durationMs / 1000).toFixed(1)}s`);
  log('[HistoricalSync] ═══════════════════════════════════════════════════');

  return results;
}

/**
 * Estimate how long a historical sync might take
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {number} [avgSecondsPerAppointment=3] - Estimated seconds per appointment
 * @param {number} [estimatedAppointmentsPerMonth=50] - Estimated appointments per month
 * @returns {Object} Estimate details
 */
export function estimateHistoricalSync(startDate, endDate, avgSecondsPerAppointment = 3, estimatedAppointmentsPerMonth = 50) {
  const msPerMonth = 30 * 24 * 60 * 60 * 1000;
  const totalMonths = Math.ceil((endDate - startDate) / msPerMonth);
  const estimatedAppointments = totalMonths * estimatedAppointmentsPerMonth;
  const estimatedSeconds = estimatedAppointments * avgSecondsPerAppointment;

  return {
    months: totalMonths,
    estimatedAppointments,
    estimatedMinutes: Math.ceil(estimatedSeconds / 60),
    batches: Math.ceil(totalMonths),
  };
}

export default {
  splitDateRange,
  runHistoricalSync,
  estimateHistoricalSync,
};
