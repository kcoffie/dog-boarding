/**
 * Picture of the Day — data layer for v4.1 Activity Intelligence.
 *
 * Queries daytime_appointments for today + yesterday, computes a per-worker
 * dog diff via series_id Sets, and returns structured JSON ready for image
 * rendering and WhatsApp delivery.
 *
 * Design: pure functions only — no side effects, no I/O. All DB access is
 * injected via the supabase client parameter. Fully unit-testable with
 * fixture data; no mocking of module internals required.
 *
 * @requirements REQ-v4.1
 */

import { createSyncLogger } from './scraper/logger.js';

const logger = createSyncLogger('PictureOfDay');
const log = logger.log;
const logWarn = logger.warn;

// Stable display order for workers in the rendered image.
// Matches the KNOWN_WORKERS map in daytimeSchedule.js.
const WORKER_ORDER = [61023, 208669, 141407, 174385, 189436, 164375];

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYY-MM-DD using local time components.
 * Never uses toISOString (UTC trap).
 *
 * @param {Date} date
 * @returns {string}
 */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD string into a local midnight Date.
 * Throws for invalid input — callers are responsible for pre-validating.
 *
 * @param {string} dateStr
 * @returns {Date}
 */
export function parseDateParam(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date param: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d); // local midnight, no UTC trap
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date param: "${dateStr}" does not resolve to a valid date.`);
  }
  return date;
}

/**
 * Return the YYYY-MM-DD string for the day before `date`.
 *
 * @param {Date} date
 * @returns {string}
 */
function yesterdayStr(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
}

// ---------------------------------------------------------------------------
// DB query helpers
// ---------------------------------------------------------------------------

/**
 * Query DC/PG appointments for one date, grouped by worker_external_id.
 * Also computes max(updated_at) across all rows for the "as of" timestamp
 * displayed in the image header. This avoids a second DB round-trip.
 *
 * Error-handling: Supabase errors throw — caller decides fatal vs. retry.
 * An empty result is not an error (means no cron data yet for this date).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} label   - 'today' | 'yesterday' (for log readability)
 * @returns {Promise<{ byWorker: Map<number, Array>, maxUpdatedAt: string|null }>}
 */
async function queryAppointmentsByDate(supabase, dateStr, label) {
  log(`Querying ${label} DC/PG appointments for ${dateStr}`);

  const { data, error } = await supabase
    .from('daytime_appointments')
    .select('external_id, series_id, worker_external_id, pet_names, client_name, service_category, title, updated_at')
    .eq('appointment_date', dateStr)
    .in('service_category', ['DC', 'PG'])
    .order('worker_external_id');

  if (error) {
    // Decision: DB error is fatal — we cannot render a meaningful image without data.
    logWarn(`Query failed for ${label} (${dateStr}): ${error.message} [code: ${error.code}]`);
    throw new Error(`DB query failed for ${label}: ${error.message}`);
  }

  // Compute max(updated_at) in JS — single pass, no extra query.
  // Decision: null when there are no rows (cron hasn't run yet for this date).
  // Numeric timestamp comparison (.getTime()) rather than string comparison —
  // ISO strings are lexicographically sortable but the intent should be explicit.
  let maxUpdatedAt = null;
  let maxUpdatedAtMs = 0;
  for (const row of data) {
    if (row.updated_at) {
      const ms = new Date(row.updated_at).getTime();
      if (ms > maxUpdatedAtMs) {
        maxUpdatedAtMs = ms;
        maxUpdatedAt = row.updated_at;
      }
    }
  }

  log(`${label} (${dateStr}): ${data.length} DC/PG rows, max updated_at: ${maxUpdatedAt ?? 'none'}`);

  // Decision: group by worker_external_id for O(1) diff lookup below.
  const byWorker = new Map();
  for (const row of data) {
    const wid = row.worker_external_id;
    if (!byWorker.has(wid)) byWorker.set(wid, []);
    byWorker.get(wid).push(row);
  }
  return { byWorker, maxUpdatedAt };
}

/**
 * Query boarding dogs present on a given date.
 * Returns a deduplicated array of pet name strings.
 *
 * Error-handling: returns [] on DB error (boarders list is non-critical;
 * a failed boarders query should not block the image send).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dateStr
 * @returns {Promise<string[]>}
 */
async function queryBoarders(supabase, dateStr) {
  log(`Querying boarders for ${dateStr}`);

  const { data, error } = await supabase
    .from('daytime_appointments')
    .select('pet_names')
    .eq('appointment_date', dateStr)
    .eq('service_category', 'Boarding');

  if (error) {
    // Decision: non-fatal — return empty list and warn.
    logWarn(`Boarders query failed for ${dateStr}: ${error.message} — omitting from image`);
    return [];
  }

  // Flatten all pet_names arrays, deduplicate preserving first-seen order.
  const seen = new Set();
  const boarders = [];
  for (const row of data) {
    for (const name of (row.pet_names || [])) {
      if (name && !seen.has(name)) {
        seen.add(name);
        boarders.push(name);
      }
    }
  }

  log(`Boarders today: ${boarders.length} dogs`);
  return boarders;
}

/**
 * Query active workers from the workers table.
 * Returns Map<externalId, name>.
 *
 * Error-handling: returns empty Map on DB error; worker names fall back to
 * "Worker {id}" so the image still renders.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Map<number, string>>}
 */
async function queryWorkers(supabase) {
  const { data, error } = await supabase
    .from('workers')
    .select('external_id, name')
    .eq('active', true);

  if (error) {
    logWarn(`Workers query failed: ${error.message} — will use fallback names`);
    return new Map();
  }

  return new Map(data.map(w => [w.external_id, w.name]));
}

// ---------------------------------------------------------------------------
// Diff logic
// ---------------------------------------------------------------------------

/**
 * Compute the diff between today's and yesterday's appointments for one worker.
 *
 * Strategy: build Set<series_id> for each day. Events with a null series_id
 * cannot be tracked across days — they are treated as unchanged (conservative:
 * avoids false "new dog!" spam for series-less appointments).
 *
 * Returns a flat list with `isAdded` / `isRemoved` flags. The caller is
 * responsible for sorting (added → removed → unchanged) before rendering.
 *
 * @param {Array} todayAppts
 * @param {Array} yestAppts
 * @returns {Array<{pet_names, client_name, series_id, title, isAdded, isRemoved}>}
 */
function computeWorkerDiff(todayAppts, yestAppts) {
  // Build series ID sets for set-difference comparison.
  const yestSeries = new Set(yestAppts.map(a => a.series_id).filter(Boolean));
  const todaySeries = new Set(todayAppts.map(a => a.series_id).filter(Boolean));

  // Today's dogs — flagged if their series didn't appear yesterday.
  const dogs = todayAppts.map(a => ({
    pet_names: a.pet_names || [],
    client_name: a.client_name || '',
    series_id: a.series_id,
    title: a.title,
    isAdded: Boolean(a.series_id) && !yestSeries.has(a.series_id),
    isRemoved: false,
  }));

  // Removed dogs — in yesterday but absent today.
  for (const yest of yestAppts) {
    if (yest.series_id && !todaySeries.has(yest.series_id)) {
      dogs.push({
        pet_names: yest.pet_names || [],
        client_name: yest.client_name || '',
        series_id: yest.series_id,
        title: yest.title,
        isAdded: false,
        isRemoved: true,
      });
    }
  }

  return dogs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the full "picture of the day" data structure.
 *
 * Runs today, yesterday, workers, and boarders queries in parallel (Promise.all)
 * then computes per-worker diffs. Returns a data object suitable for both
 * image rendering (api/roster-image.js) and hash-based change detection.
 *
 * Error-handling: DB errors from the primary queries (today/yesterday) throw
 * so the caller (api/notify.js) can log and skip the send rather than sending
 * a broken image. The boarders and workers queries degrade gracefully.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Date} date - Local midnight date to generate the picture for
 * @returns {Promise<PictureOfDayData>}
 */
export async function getPictureOfDay(supabase, date) {
  const dateStr = toDateStr(date);
  const yestDateStr = yesterdayStr(date);

  log(`getPictureOfDay — date: ${dateStr}, yesterday: ${yestDateStr}`);

  // Run all four queries in parallel — none depend on each other.
  // todayResult carries { byWorker, maxUpdatedAt }; yesterday only needs byWorker.
  const [todayResult, yestResult, workerNames, boarders] = await Promise.all([
    queryAppointmentsByDate(supabase, dateStr, 'today'),
    queryAppointmentsByDate(supabase, yestDateStr, 'yesterday'),
    queryWorkers(supabase),
    queryBoarders(supabase, dateStr),
  ]);

  const todayByWorker = todayResult.byWorker;
  const yestByWorker = yestResult.byWorker;
  // lastSyncedAt: ISO timestamp of most recently updated today row, or null.
  // Decision: null means the midnight cron data is being used (no intra-day refresh ran).
  const lastSyncedAt = todayResult.maxUpdatedAt;

  // Decision log: zero today rows means cron hasn't run yet for this date.
  if (todayByWorker.size === 0) {
    logWarn(`No DC/PG data for ${dateStr} — cron may not have run yet for today`);
  }

  // Decision log: zero yesterday rows means diff has no baseline.
  if (yestByWorker.size === 0) {
    log(`No yesterday data for ${yestDateStr} — all today dogs will appear as added`);
  }

  // Collect all worker IDs that appear in today or yesterday (excluding 0 = boardings).
  const allWorkerIds = new Set([...todayByWorker.keys(), ...yestByWorker.keys()]);
  allWorkerIds.delete(0);

  // Sort by known display order; unknown workers fall to the end sorted by ID.
  const sortedWorkerIds = [...allWorkerIds].sort((a, b) => {
    const ai = WORKER_ORDER.indexOf(a);
    const bi = WORKER_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a - b;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  let hasUpdates = false;
  const workers = [];

  for (const workerId of sortedWorkerIds) {
    const todayAppts = todayByWorker.get(workerId) || [];
    const yestAppts = yestByWorker.get(workerId) || [];
    const name = workerNames.get(workerId) || `Worker ${workerId}`;

    const dogs = computeWorkerDiff(todayAppts, yestAppts);

    // Sort within worker: added first → removed → unchanged.
    dogs.sort((a, b) => {
      const scoreA = a.isAdded ? 0 : a.isRemoved ? 1 : 2;
      const scoreB = b.isAdded ? 0 : b.isRemoved ? 1 : 2;
      return scoreA - scoreB;
    });

    const addedCount = dogs.filter(d => d.isAdded).length;
    const removedCount = dogs.filter(d => d.isRemoved).length;
    if (addedCount > 0 || removedCount > 0) hasUpdates = true;

    log(`Worker ${name} (${workerId}): +${addedCount} added, -${removedCount} removed, ${todayAppts.length - addedCount} unchanged`);

    workers.push({ workerId, name, dogs, addedCount, removedCount });
  }

  log(`getPictureOfDay complete — ${workers.length} workers, ${boarders.length} boarders, hasUpdates: ${hasUpdates}, lastSyncedAt: ${lastSyncedAt ?? 'none'}`);

  // lastSyncedAt: ISO string or null. Rendered as "(as of HH:MM AM)" in the image header.
  // boarders: kept in data struct for easy restoration; not rendered or hashed in v4.1.1+.
  return { date: dateStr, workers, boarders, hasUpdates, lastSyncedAt };
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/**
 * Compute a stable hash of the picture data for send-gate comparison.
 *
 * Uses djb2 over the JSON-serialized key fields. Not cryptographic — only
 * needs to be stable for identical inputs (same JS runtime, same data).
 * The hash captures which series IDs appear per worker and the boarder list.
 *
 * @param {object} data - Return value of getPictureOfDay
 * @returns {string} Unsigned 32-bit integer as a decimal string
 */
export function hashPicture(data) {
  // Decision: boarders intentionally excluded from hash in v4.1.1.
  // Boarder changes should not trigger a resend since boarders are not rendered.
  // lastSyncedAt intentionally excluded — timestamp changes must not trigger resend.
  const key = JSON.stringify({
    date: data.date,
    workers: data.workers.map(w => ({
      id: w.workerId,
      // Use series_id as the stable identifier; fall back to pet names for null-series rows.
      dogs: w.dogs.map(d => d.series_id || d.pet_names.join(',')),
    })),
  });

  // djb2 hash — fast, sufficient entropy for change detection.
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash |= 0; // Force 32-bit
  }
  return String(hash >>> 0); // Unsigned
}

/**
 * Decide whether to send a notification given the time window and last hash.
 *
 * Gate logic:
 * - '4am'  → always send (first send of the day; establishes the baseline hash)
 * - '7am' | '8:30am' → send only if current hash differs from the last sent hash
 *
 * Error-handling: invalid window throws (caller should validate before calling).
 * null lastSentHash (no prior send today) → send with reason 'no_baseline'.
 *
 * @param {string} window      - '4am' | '7am' | '8:30am'
 * @param {object} data        - Current picture data
 * @param {string|null} lastSentHash
 * @returns {{ shouldSend: boolean, reason: string, currentHash: string }}
 */
export function shouldSendNotification(window, data, lastSentHash) {
  const VALID_WINDOWS = ['4am', '7am', '8:30am'];
  if (!VALID_WINDOWS.includes(window)) {
    throw new Error(`Invalid window: "${window}". Must be one of: ${VALID_WINDOWS.join(', ')}`);
  }

  const currentHash = hashPicture(data);

  if (window === '4am') {
    log(`shouldSend: window=4am — always send (hash: ${currentHash})`);
    return { shouldSend: true, reason: 'first_send_of_day', currentHash };
  }

  if (!lastSentHash) {
    log(`shouldSend: window=${window} — no baseline hash → send`);
    return { shouldSend: true, reason: 'no_baseline', currentHash };
  }

  if (currentHash === lastSentHash) {
    log(`shouldSend: window=${window} — hash unchanged (${currentHash}) → skip`);
    return { shouldSend: false, reason: 'no_change', currentHash };
  }

  log(`shouldSend: window=${window} — hash changed (${lastSentHash} → ${currentHash}) → send`);
  return { shouldSend: true, reason: 'data_changed', currentHash };
}
