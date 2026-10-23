/**
 * Archive reconciliation — detects and archives appointments that no longer
 * appear on the schedule page (e.g., amended bookings where the old URL is gone).
 * @requirements REQ-108
 */

import { authenticatedFetch, SiteThrottled } from './auth.js';
import { classifyRedirect } from './redirects.js';
import { syncLogger } from './logger.js';

const syncLog = syncLogger.log;
const syncError = syncLogger.error;
const syncWarn = syncLogger.warn;

/** More missing bookings than this: skip reconciliation without opening any (#324). */
export const MAX_CANDIDATES = 10;
/** More bookings gone than this: mark none (Kate, 2026-10-21). */
export const MAX_ARCHIVES = 3;

/**
 * What a candidate's URL says, fetched without following redirects (#324).
 *
 * A removed booking's URL answers 302 to /schedule (seen 2026-10-21 on an archived booking);
 * the "You cannot view appointment" popup is drawn by JavaScript, so it's not in the HTML.
 *   'gone'       — a redirect to exactly /schedule on the booking site
 *   'present'    — 200 with an appointment page (`data-start_scheduled`)
 *   'unexpected' — anything else: a redirect elsewhere (the login page means the session
 *                  failed), an error status, an unrecognised page. Reconciliation stops.
 * A 429/403 never gets here: authenticatedFetch throws SiteThrottled first.
 *
 * @param {{ status: number, headers: { get(name: string): string|null } }} response
 * @param {string} html
 * @returns {'gone'|'present'|'unexpected'}
 */
export function classifyCandidateResponse(response, html) {
  const redirect = classifyRedirect(response);
  if (redirect) return redirect === 'schedule' ? 'gone' : 'unexpected';
  if (response.status === 200 && html.includes('data-start_scheduled')) return 'present';
  return 'unexpected';
}

/**
 * Find active sync_appointments that were not seen during this sync and overlap
 * the sync window. These are candidates for archival.
 *
 * For full syncs (no startDate/endDate), returns ALL active records not in seenIds.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Set<string>} seenExternalIds
 * @param {Date|null} startDate
 * @param {Date|null} endDate
 * @returns {Promise<Array>}
 */
export async function findReconciliationCandidates(supabase, seenExternalIds, startDate, endDate) {
  let query = supabase
    .from('sync_appointments')
    .select('id, external_id, source_url, check_in_datetime, check_out_datetime, mapped_boarding_id')
    .eq('sync_status', 'active');

  // Filter to records that overlap the fetch window. Apply each bound independently
  // so callers can supply only startDate (e.g. full sync defaulting to today) without
  // requiring an endDate. Without any filter, past-ended records generate false-positive
  // "possible sync bug" warnings because the schedule never shows them.
  if (startDate) {
    query = query.gte('check_out_datetime', startDate.toISOString());
  }
  if (endDate) {
    query = query.lt('check_in_datetime', endDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;

  // Filter out seen external IDs in JS (Supabase .not('col', 'in', [...]) works
  // but can be verbose; JS filter is simpler for a small result set).
  return (data || []).filter(row => !seenExternalIds.has(row.external_id));
}

/**
 * Mark a sync_appointment as archived.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} externalId
 */
export async function archiveSyncAppointment(supabase, externalId) {
  const { error } = await supabase
    .from('sync_appointments')
    .update({
      sync_status: 'archived',
      last_change_type: 'archived',
      last_changed_at: new Date().toISOString(),
    })
    .eq('external_id', externalId);

  if (error) throw error;
}

/**
 * Mark a boarding as cancelled when its sync_appointment is archived.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} boardingId
 */
export async function cancelBoardingForArchivedAppointment(supabase, boardingId) {
  const { error } = await supabase
    .from('boardings')
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'appointment_archived',
    })
    .eq('id', boardingId);

  if (error) throw error;
}

/**
 * Reconcile archived appointments after the main sync loop.
 *
 * Finds active records not seen during this sync, opens each source_url without following
 * redirects, and marks them archived only on proof (#324):
 *   - more than MAX_CANDIDATES candidates: skip without opening any
 *   - check every candidate first; any unexpected answer stops and marks nothing
 *   - more than MAX_ARCHIVES gone: mark none
 * `skipped` explains a stop, for the run's result and sync_logs.
 *
 * Throws only SiteThrottled (a 429/403 ends the whole run). Everything else is logged and counted.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Set<string>} seenExternalIds
 * @param {Date|null} startDate
 * @param {Date|null} endDate
 * @returns {Promise<{archived: number, warnings: number, errors: number, skipped: string|null}>}
 */
export async function reconcileArchivedAppointments(supabase, seenExternalIds, startDate, endDate) {
  const counts = { archived: 0, warnings: 0, errors: 0, skipped: null };

  let candidates;
  try {
    candidates = await findReconciliationCandidates(supabase, seenExternalIds, startDate, endDate);
  } catch (err) {
    syncError('[Reconcile] ❌ Failed to query reconciliation candidates:', err.message, err.stack);
    counts.errors++;
    return counts;
  }

  syncLog(`[Reconcile] Starting reconciliation: ${candidates.length} candidates`, {
    startDate: startDate?.toISOString() ?? 'full sync',
    endDate: endDate?.toISOString() ?? 'full sync',
  });

  if (candidates.length > MAX_CANDIDATES) {
    counts.skipped = `Reconciliation skipped: ${candidates.length} bookings missing from the schedule (more than ${MAX_CANDIDATES}), none opened`;
    syncWarn(`[Reconcile] ⚠️ ${counts.skipped}`);
    return counts;
  }

  const gone = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    syncLog(`[Reconcile] Checking ${i + 1}/${candidates.length}: ${candidate.external_id}`);

    let verdict;
    let status;
    try {
      const response = await authenticatedFetch(candidate.source_url, { redirect: 'manual' });
      status = response.status;
      verdict = classifyCandidateResponse(response, await response.text());
    } catch (fetchErr) {
      if (fetchErr instanceof SiteThrottled) throw fetchErr;
      counts.errors++;
      counts.skipped = `Reconciliation stopped: ${candidate.external_id} couldn't be opened (${fetchErr.message}), nothing marked`;
      syncError(`[Reconcile] ❌ ${counts.skipped}`);
      return counts;
    }

    if (verdict === 'gone') {
      syncLog(`[Reconcile] Gone from the site: ${candidate.external_id}`);
      gone.push(candidate);
    } else if (verdict === 'present') {
      syncWarn(`[Reconcile] ⚠️ ${candidate.external_id} loaded a valid appointment page but was NOT seen during sync — NOT archiving. Possible sync bug.`);
      counts.warnings++;
    } else {
      counts.skipped = `Reconciliation stopped: unexpected answer (HTTP ${status}) for ${candidate.external_id}, nothing marked`;
      syncWarn(`[Reconcile] ⚠️ ${counts.skipped}`);
      return counts;
    }
  }

  if (gone.length > MAX_ARCHIVES) {
    counts.skipped = `Reconciliation stopped: ${gone.length} bookings look removed (more than ${MAX_ARCHIVES}), nothing marked`;
    syncWarn(`[Reconcile] ⚠️ ${counts.skipped}`);
    return counts;
  }

  for (const candidate of gone) {
    try {
      await archiveSyncAppointment(supabase, candidate.external_id);
      counts.archived++;

      if (candidate.mapped_boarding_id) {
        try {
          await cancelBoardingForArchivedAppointment(supabase, candidate.mapped_boarding_id);
          syncLog(`[Reconcile] ✅ Marked boarding ${candidate.mapped_boarding_id} as cancelled`);
        } catch (cancelErr) {
          syncError(`[Reconcile] ❌ Failed to cancel boarding ${candidate.mapped_boarding_id}:`, cancelErr.message);
          counts.errors++;
        }
      }
    } catch (archiveErr) {
      syncError(`[Reconcile] ❌ Failed to archive ${candidate.external_id}:`, archiveErr.message);
      counts.errors++;
    }
  }

  syncLog(`[Reconcile] Done: ${counts.archived} archived, ${counts.warnings} warnings, ${counts.errors} errors`);
  return counts;
}

export default {
  classifyCandidateResponse,
  findReconciliationCandidates,
  archiveSyncAppointment,
  cancelBoardingForArchivedAppointment,
  reconcileArchivedAppointments,
};
