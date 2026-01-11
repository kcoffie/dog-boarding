/**
 * Sync service - orchestrates the full sync process
 * @requirements REQ-104, REQ-106
 */

import { createClient } from '@supabase/supabase-js';
import { SCRAPER_CONFIG } from './config.js';
import { authenticate, isAuthenticated } from './auth.js';
import { fetchAllSchedulePages } from './schedule.js';
import { fetchAppointmentDetails } from './extraction.js';
import { mapAndSaveAppointment } from './mapping.js';

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
 * Sync status enum
 */
export const SyncStatus = {
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
};

/**
 * Create a new sync log entry
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Object>}
 */
export async function createSyncLog(supabase) {
  console.log('[Sync] Creating sync log entry...');
  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      status: SyncStatus.RUNNING,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[Sync] createSyncLog error:', error);
    console.error('[Sync] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  console.log('[Sync] Sync log created:', data.id);
  return data;
}

/**
 * Update sync log with results
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} logId
 * @param {Object} updates
 */
export async function updateSyncLog(supabase, logId, updates) {
  const { error } = await supabase
    .from('sync_logs')
    .update({
      ...updates,
      completed_at: new Date().toISOString(),
    })
    .eq('id', logId);

  if (error) throw error;
}

/**
 * Get sync settings
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Object|null>}
 */
export async function getSyncSettings(supabase) {
  console.log('[Sync] Getting sync settings...');
  const { data, error } = await supabase
    .from('sync_settings')
    .select('*')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[Sync] getSyncSettings error:', error);
    throw error;
  }
  console.log('[Sync] Sync settings:', data ? 'found' : 'not found');
  return data;
}

/**
 * Update sync settings
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} updates
 */
export async function updateSyncSettings(supabase, updates) {
  console.log('[Sync] Updating sync settings:', updates);
  const settings = await getSyncSettings(supabase);

  if (settings) {
    console.log('[Sync] Updating existing settings:', settings.id);
    const { error } = await supabase
      .from('sync_settings')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id);

    if (error) {
      console.error('[Sync] updateSyncSettings (update) error:', error);
      throw error;
    }
  } else {
    console.log('[Sync] Creating new sync settings...');
    const { error } = await supabase
      .from('sync_settings')
      .insert({
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[Sync] updateSyncSettings (insert) error:', error);
      throw error;
    }
  }
  console.log('[Sync] Sync settings updated successfully');
}

/**
 * Sanitize error messages to avoid leaking sensitive information
 * @param {string} message - Raw error message
 * @returns {string} Sanitized error message
 */
export function sanitizeError(message) {
  if (!message) return 'Unknown error';

  // Remove URLs that might contain credentials or internal paths
  let sanitized = message.replace(/https?:\/\/[^\s]+/g, '[URL]');

  // Remove potential credential leaks
  sanitized = sanitized.replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');
  sanitized = sanitized.replace(/username[=:]\s*\S+/gi, 'username=[REDACTED]');
  sanitized = sanitized.replace(/email[=:]\s*\S+/gi, 'email=[REDACTED]');

  // Truncate very long messages that might contain HTML/data dumps
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '...';
  }

  return sanitized;
}

/**
 * Delay helper with jitter
 * @param {number} ms
 * @param {number} [jitter=0.2] - Random jitter factor (0-1)
 */
function delay(ms, jitter = 0.2) {
  const jitterMs = ms * jitter * Math.random();
  return new Promise(resolve => setTimeout(resolve, ms + jitterMs));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number[]} [options.delays]
 * @returns {Promise<any>}
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = SCRAPER_CONFIG.maxRetries,
    delays = SCRAPER_CONFIG.retryDelays,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delayMs = delays[attempt] || delays[delays.length - 1];
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Run a full sync
 * @param {Object} options
 * @param {string} [options.username] - External site username
 * @param {string} [options.password] - External site password
 * @param {Date} [options.startDate] - Start of date range
 * @param {Date} [options.endDate] - End of date range
 * @param {boolean} [options.boardingOnly=true] - Only sync boarding appointments
 * @param {Function} [options.onProgress] - Progress callback
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>} Sync results
 */
export async function runSync(options = {}) {
  const {
    username = import.meta.env.VITE_EXTERNAL_SITE_USERNAME,
    password = import.meta.env.VITE_EXTERNAL_SITE_PASSWORD,
    startDate,
    endDate,
    boardingOnly = true,
    onProgress,
    supabase = getSupabaseClient(),
  } = options;

  const startTime = Date.now();
  const timings = {};
  let syncLog = null;

  const logTiming = (label, startMs) => {
    const duration = Date.now() - startMs;
    timings[label] = duration;
    console.log(`[Sync] ⏱️ ${label}: ${duration}ms`);
    return duration;
  };

  const result = {
    success: false,
    status: SyncStatus.FAILED,
    appointmentsFound: 0,
    appointmentsCreated: 0,
    appointmentsUpdated: 0,
    appointmentsFailed: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    // Create sync log
    let stepStart = Date.now();
    syncLog = await createSyncLog(supabase);
    logTiming('createSyncLog', stepStart);
    onProgress?.({ stage: 'started', logId: syncLog.id });

    // Authenticate if needed
    if (!isAuthenticated()) {
      if (!username || !password) {
        throw new Error('External site credentials required');
      }

      onProgress?.({ stage: 'authenticating' });
      stepStart = Date.now();
      console.log('[Sync] 🔐 Starting authentication...');
      const authResult = await withRetry(() => authenticate(username, password));
      logTiming('authentication', stepStart);

      if (!authResult.success) {
        throw new Error(`Authentication failed: ${authResult.error}`);
      }
    } else {
      console.log('[Sync] ✅ Already authenticated, skipping login');
    }

    onProgress?.({ stage: 'authenticated' });

    // Fetch schedule
    onProgress?.({ stage: 'fetching_schedule' });
    stepStart = Date.now();
    console.log('[Sync] 📅 Fetching schedule pages...');
    const appointments = await withRetry(() =>
      fetchAllSchedulePages({ startDate, endDate, boardingOnly })
    );
    logTiming('fetchSchedule', stepStart);

    result.appointmentsFound = appointments.length;
    console.log(`[Sync] 📋 Found ${appointments.length} appointments`);
    onProgress?.({ stage: 'schedule_fetched', count: appointments.length });

    // Process each appointment
    const appointmentTimings = [];
    const processingStart = Date.now();

    for (let i = 0; i < appointments.length; i++) {
      const appt = appointments[i];
      const apptStart = Date.now();

      try {
        onProgress?.({
          stage: 'processing',
          current: i + 1,
          total: appointments.length,
          appointment: appt.id,
        });

        // Rate limiting delay
        if (i > 0) {
          await delay(SCRAPER_CONFIG.delayBetweenRequests);
        }

        // Extract appointment URL parts
        const urlMatch = appt.url.match(/\/schedule\/a\/([^/]+)\/(\d+)/);
        const [, appointmentId, timestamp] = urlMatch || [null, appt.id, ''];

        // Fetch details with retry
        const fetchStart = Date.now();
        const details = await withRetry(() =>
          fetchAppointmentDetails(appointmentId, timestamp)
        );
        const fetchDuration = Date.now() - fetchStart;

        // Map and save
        const saveStart = Date.now();
        const saveResult = await mapAndSaveAppointment(details, { supabase });
        const saveDuration = Date.now() - saveStart;

        const totalDuration = Date.now() - apptStart;
        appointmentTimings.push({ id: appt.id, fetch: fetchDuration, save: saveDuration, total: totalDuration });

        console.log(`[Sync] ⏱️ Appointment ${i + 1}/${appointments.length} (${appt.id}): fetch=${fetchDuration}ms, save=${saveDuration}ms, total=${totalDuration}ms`);

        if (saveResult.stats.dogCreated || saveResult.stats.boardingCreated) {
          result.appointmentsCreated++;
        } else if (saveResult.stats.dogUpdated || saveResult.stats.boardingUpdated) {
          result.appointmentsUpdated++;
        }
      } catch (error) {
        result.appointmentsFailed++;
        const sanitizedMsg = sanitizeError(error.message);
        result.errors.push({
          external_id: appt.id,
          error: sanitizedMsg,
        });

        console.log(`[Sync] ❌ Appointment ${i + 1}/${appointments.length} (${appt.id}) failed after ${Date.now() - apptStart}ms: ${sanitizedMsg}`);

        onProgress?.({
          stage: 'error',
          appointment: appt.id,
          error: sanitizedMsg,
        });

        // Continue with next appointment (don't stop on individual failures)
      }
    }

    const processingDuration = Date.now() - processingStart;
    timings.processingTotal = processingDuration;

    if (appointmentTimings.length > 0) {
      const avgFetch = Math.round(appointmentTimings.reduce((sum, t) => sum + t.fetch, 0) / appointmentTimings.length);
      const avgSave = Math.round(appointmentTimings.reduce((sum, t) => sum + t.save, 0) / appointmentTimings.length);
      const avgTotal = Math.round(appointmentTimings.reduce((sum, t) => sum + t.total, 0) / appointmentTimings.length);
      console.log(`[Sync] 📊 Processing summary: ${appointmentTimings.length} appointments, avg fetch=${avgFetch}ms, avg save=${avgSave}ms, avg total=${avgTotal}ms`);
    }
    console.log(`[Sync] ⏱️ Total processing time: ${processingDuration}ms`);

    // Determine final status
    result.durationMs = Date.now() - startTime;

    if (result.appointmentsFailed === 0) {
      result.status = SyncStatus.SUCCESS;
      result.success = true;
    } else if (result.appointmentsFailed < result.appointmentsFound) {
      result.status = SyncStatus.PARTIAL;
      result.success = true;
    } else {
      result.status = SyncStatus.FAILED;
    }

    // Update sync log
    stepStart = Date.now();
    await updateSyncLog(supabase, syncLog.id, {
      status: result.status,
      appointments_found: result.appointmentsFound,
      appointments_created: result.appointmentsCreated,
      appointments_updated: result.appointmentsUpdated,
      appointments_failed: result.appointmentsFailed,
      errors: result.errors,
      duration_ms: result.durationMs,
    });
    logTiming('updateSyncLog', stepStart);

    // Update sync settings
    stepStart = Date.now();
    await updateSyncSettings(supabase, {
      last_sync_at: new Date().toISOString(),
      last_sync_status: result.status,
      last_sync_message: result.success
        ? `Synced ${result.appointmentsCreated + result.appointmentsUpdated} appointments`
        : `Failed: ${sanitizeError(result.errors[0]?.error) || 'Unknown error'}`,
    });
    logTiming('updateSyncSettings', stepStart);

    // Final timing summary
    console.log('[Sync] ═══════════════════════════════════════════════════');
    console.log(`[Sync] ✅ SYNC COMPLETED - ${result.status.toUpperCase()}`);
    console.log(`[Sync] 📊 Results: ${result.appointmentsFound} found, ${result.appointmentsCreated} created, ${result.appointmentsUpdated} updated, ${result.appointmentsFailed} failed`);
    console.log('[Sync] ⏱️ Timing breakdown:');
    Object.entries(timings).forEach(([key, value]) => {
      console.log(`[Sync]    - ${key}: ${value}ms`);
    });
    console.log(`[Sync] ⏱️ TOTAL: ${result.durationMs}ms (${(result.durationMs / 1000).toFixed(1)}s)`);
    console.log('[Sync] ═══════════════════════════════════════════════════');

    onProgress?.({ stage: 'completed', result });

  } catch (error) {
    result.durationMs = Date.now() - startTime;
    result.errors.push({ error: sanitizeError(error.message) });

    const sanitizedMsg = sanitizeError(error.message);

    // Error timing summary
    console.log('[Sync] ═══════════════════════════════════════════════════');
    console.log(`[Sync] ❌ SYNC FAILED after ${result.durationMs}ms (${(result.durationMs / 1000).toFixed(1)}s)`);
    console.log(`[Sync] 💥 Error: ${sanitizedMsg}`);
    console.log('[Sync] ⏱️ Timing breakdown:');
    Object.entries(timings).forEach(([key, value]) => {
      console.log(`[Sync]    - ${key}: ${value}ms`);
    });
    console.log('[Sync] ═══════════════════════════════════════════════════');

    // Update sync log if it was created
    if (syncLog) {
      await updateSyncLog(supabase, syncLog.id, {
        status: SyncStatus.FAILED,
        appointments_found: result.appointmentsFound,
        appointments_failed: result.appointmentsFailed,
        errors: result.errors,
        duration_ms: result.durationMs,
      }).catch(() => {}); // Ignore errors updating log
    }

    // Update sync settings
    await updateSyncSettings(supabase, {
      last_sync_at: new Date().toISOString(),
      last_sync_status: SyncStatus.FAILED,
      last_sync_message: sanitizedMsg,
    }).catch(() => {});

    onProgress?.({ stage: 'failed', error: sanitizedMsg });

    // Re-throw with sanitized message
    const sanitizedError = new Error(sanitizedMsg);
    sanitizedError.originalError = error;
    throw sanitizedError;
  }

  return result;
}

/**
 * Get recent sync logs
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
export async function getRecentSyncLogs(supabase, limit = 10) {
  const { data, error } = await supabase
    .from('sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Check if sync is currently running
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>}
 */
export async function isSyncRunning(supabase) {
  const { data, error } = await supabase
    .from('sync_logs')
    .select('id')
    .eq('status', SyncStatus.RUNNING)
    .limit(1);

  if (error) throw error;
  return data && data.length > 0;
}

/**
 * Abort stuck sync (mark as failed if running too long)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [maxAgeMinutes=30]
 */
export async function abortStuckSync(supabase, maxAgeMinutes = 30) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('sync_logs')
    .update({
      status: SyncStatus.FAILED,
      completed_at: new Date().toISOString(),
      errors: [{ error: 'Sync timed out and was aborted' }],
    })
    .eq('status', SyncStatus.RUNNING)
    .lt('started_at', cutoff);

  if (error) throw error;
}

export default {
  SyncStatus,
  createSyncLog,
  updateSyncLog,
  getSyncSettings,
  updateSyncSettings,
  runSync,
  getRecentSyncLogs,
  isSyncRunning,
  abortStuckSync,
};
