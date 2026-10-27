/**
 * Archive reconciliation — detects and archives appointments that no longer
 * appear on the schedule page (e.g., amended bookings where the old URL is gone).
 * @requirements REQ-108
 */

import { authenticatedFetch, SiteThrottled } from './auth.js';
import { classifyRedirect } from './redirects.js';
import { syncLogger } from './logger.js';
import { findBookingBoardings } from './mapping.js';

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
    .select('id, external_id, source_url, service_type, pet_name, check_in_datetime, check_out_datetime, mapped_boarding_id')
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
 * Every one of a removed booking's boardings is cancelled (`<id>` and each `<id>_pN`, one per dog), then
 * its row is archived; if a write fails, the dogs already cancelled are un-cancelled and the row stays
 * active, so the next run finds it again (#316). Each candidate is opened at its newest known URL (its
 * queue item's). With `reportOnly`, the candidates are checked but nothing is marked (Kate, Q5).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Set<string>} seenExternalIds
 * @param {Date|null} startDate
 * @param {Date|null} endDate
 * @param {{ reportOnly?: boolean }} [options]
 * @returns {Promise<{archived: number, warnings: number, errors: number, skipped: string|null,
 *   candidates: number, gone: Array<Object>, present: string[]}>}
 */
export async function reconcileArchivedAppointments(supabase, seenExternalIds, startDate, endDate, { reportOnly = false } = {}) {
  const counts = { archived: 0, warnings: 0, errors: 0, skipped: null, candidates: 0, gone: [], present: [] };

  let candidates;
  try {
    candidates = await findReconciliationCandidates(supabase, seenExternalIds, startDate, endDate);
  } catch (err) {
    syncError('[Reconcile] ❌ Failed to query reconciliation candidates:', err.message, err.stack);
    counts.errors++;
    counts.skipped = `Reconciliation stopped: the bookings to check couldn't be read (${err.message})`;
    return counts;
  }
  counts.candidates = candidates.length;

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
      // The newest URL the sync knows: an edited booking's stored URL also redirects to /schedule,
      // but the schedule scan puts its new URL on its queue item (#316)
      const { data: queued, error: queueErr } = await supabase
        .from('sync_queue')
        .select('source_url')
        .eq('external_id', candidate.external_id)
        .maybeSingle();
      if (queueErr) throw new Error(`its queue item couldn't be read: ${queueErr.message}`);
      const pageUrl = queued?.source_url || candidate.source_url;
      const response = await authenticatedFetch(pageUrl, { redirect: 'manual' });
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
      counts.present.push(candidate.external_id);
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

  counts.gone = gone.map((c) => ({
    external_id: c.external_id,
    service_type: c.service_type ?? null,
    pet_name: c.pet_name ?? null,
    check_in_datetime: c.check_in_datetime,
    check_out_datetime: c.check_out_datetime,
    dogs: 0,
  }));
  if (reportOnly) {
    syncLog(`[Reconcile] Report only: ${gone.length} would be cancelled, nothing marked`);
    return counts;
  }

  for (const [i, candidate] of gone.entries()) {
    const cancelled = [];
    try {
      const boardings = await findBookingBoardings(supabase, candidate.external_id);
      for (const boarding of boardings) {
        await cancelBoardingForArchivedAppointment(supabase, boarding.id);
        cancelled.push(boarding.id);
        syncLog(`[Reconcile] ✅ Marked boarding ${boarding.id} (${boarding.external_id}) as cancelled`);
      }
      counts.gone[i].dogs = boardings.length;
      await archiveSyncAppointment(supabase, candidate.external_id);
      counts.archived++;
    } catch (markErr) {
      syncError(`[Reconcile] ❌ Failed to cancel ${candidate.external_id}:`, markErr.message);
      counts.errors++;
      // All or nothing: a booking left active must not keep some dogs cancelled, because a booking
      // seen again later is never a candidate, and only archived ones are restored
      for (const id of cancelled) {
        const { error } = await supabase.from('boardings').update({ cancelled_at: null, cancellation_reason: null }).eq('id', id);
        if (error) syncError(`[Reconcile] ❌ Couldn't undo the cancel of boarding ${id}: ${error.message}`);
      }
    }
  }

  syncLog(`[Reconcile] Done: ${counts.archived} archived, ${counts.warnings} warnings, ${counts.errors} errors`);
  return counts;
}

/**
 * A cancelled booking that's on the booking site again, read and saved: un-cancel it (#316).
 * Not when one of its dogs already has another live boarding over the same dates (the amended-booking
 * case Sync Now used to guard against by skipping archived bookings forever).
 * `booking_status` is the site's and is never touched here.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} externalId
 * A booking that isn't archived (a restore mark left on its queue item) is left alone: `notArchived`.
 *
 * @returns {Promise<{restored: boolean, boardings: number, conflicts: string[], notArchived?: boolean}>}
 */
export async function restoreArchivedBooking(supabase, externalId) {
  const { data: row, error: rowErr } = await supabase
    .from('sync_appointments')
    .select('sync_status')
    .eq('external_id', externalId)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (row?.sync_status !== 'archived') return { restored: false, boardings: 0, conflicts: [], notArchived: true };

  const boardings = await findBookingBoardings(supabase, externalId);
  const own = new Set(boardings.map((b) => b.id));
  const conflicts = [];
  for (const b of boardings) {
    const { data, error } = await supabase
      .from('boardings')
      .select('id, external_id, arrival_datetime, departure_datetime, cancelled_at')
      .eq('dog_id', b.dog_id)
      .is('cancelled_at', null);
    if (error) throw error;
    // Overlap compared as moments: Supabase's "+00:00" and other forms sort differently as text
    const from = Date.parse(b.arrival_datetime);
    const to = Date.parse(b.departure_datetime);
    for (const other of data) {
      if (own.has(other.id)) continue;
      if (Date.parse(other.arrival_datetime) < to && Date.parse(other.departure_datetime) > from) {
        conflicts.push(other.external_id ?? other.id);
      }
    }
  }
  if (conflicts.length > 0) {
    syncWarn(`[Reconcile] ⚠️ ${externalId} is back on the site, but its dogs already have ${conflicts.join(', ')} on those dates: left cancelled`);
    return { restored: false, boardings: boardings.length, conflicts };
  }

  for (const b of boardings) {
    const { error } = await supabase
      .from('boardings')
      .update({ cancelled_at: null, cancellation_reason: null })
      .eq('id', b.id);
    if (error) throw error;
  }
  const { error } = await supabase
    .from('sync_appointments')
    .update({ sync_status: 'active', last_change_type: 'restored', last_changed_at: new Date().toISOString() })
    .eq('external_id', externalId);
  if (error) throw error;
  syncLog(`[Reconcile] ♻️ Restored ${externalId}: back on the booking site (${boardings.length} boarding(s))`);
  return { restored: true, boardings: boardings.length, conflicts };
}

export default {
  classifyCandidateResponse,
  findReconciliationCandidates,
  archiveSyncAppointment,
  cancelBoardingForArchivedAppointment,
  reconcileArchivedAppointments,
  restoreArchivedBooking,
};
