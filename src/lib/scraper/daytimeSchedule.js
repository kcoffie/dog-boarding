/**
 * Daytime schedule parser — ingests all Daycare, Playgroup, and Boarding
 * appointments from the weekly schedule page for v4 Activity Intelligence.
 *
 * No detail-page fetches are needed: the schedule grid exposes all required
 * fields (worker, service, pets, series ID) directly as data attributes and
 * child element text on each `.day-event <a>` element.
 *
 * Node.js safe: regex-only parsing, no DOMParser. Works in both cron context
 * and browser/jsdom tests.
 *
 * @requirements REQ-v4.0
 */

import { createSyncLogger } from './logger.js';
import { decodeEntities } from '../htmlUtils.js';
import { KNOWN_WORKERS } from '../workers.js';

const logger = createSyncLogger('DaytimeSched');
const log = logger.log;
const logWarn = logger.warn;

// ---------------------------------------------------------------------------
// Constants — classification tables
// ---------------------------------------------------------------------------

/**
 * Maps cat-{id} class number → human-readable service category label.
 * An event whose cat-id is NOT in this table is still parsed; a warning is
 * emitted so the constant can be updated when the external site adds services.
 */
const SERVICE_CATS = Object.freeze({
  5634: 'DC',       // Daycare
  7431: 'PG',       // Playgroup
  5635: 'Boarding',
});

// KNOWN_WORKERS imported from src/lib/workers.js — single source of truth for worker IDs/names.

/** Matches "Pick-Up" variants in title or display_time text. */
const PICKUP_RE = /pick-?up/i;

// decodeEntities imported from src/lib/htmlUtils.js

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Extract a named HTML attribute value from an attribute string.
 * The attrStr is the captured attrs portion of a single <a> tag, so
 * false-positive matches on unrelated attributes are not a concern.
 *
 * Regexes are compiled once per attribute name and cached — `attr()` is
 * called 7+ times per appointment block across hundreds of blocks per parse.
 *
 * Error-handling: returns null (not throws) if the attribute is absent.
 *
 * @param {string} attrStr - The attribute portion of an <a> tag
 * @param {string} name    - Exact attribute name, e.g. "data-id"
 * @returns {string|null}
 */
const _attrRegexCache = new Map();
function attr(attrStr, name) {
  let re = _attrRegexCache.get(name);
  if (!re) {
    re = new RegExp(`${name}="([^"]*)"`);
    _attrRegexCache.set(name, re);
  }
  const m = attrStr.match(re);
  return m ? m[1] : null;
}

/**
 * Extract trimmed inner text of the FIRST element with a given CSS class
 * from an HTML fragment.
 *
 * Uses a simple `class="... className ..."` pattern — sufficient for the
 * known, stable class names on the external site. Returns '' (not null) so
 * callers can safely call .trim() / boolean-check without null guards.
 *
 * Error-handling: returns '' if no match; never throws.
 *
 * @param {string} html      - Inner HTML of a day-event block
 * @param {string} className - CSS class name to search for
 * @returns {string}
 */
function innerText(html, className) {
  const re = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([^<]*)<`);
  const m = html.match(re);
  return m ? decodeEntities(m[1].trim()) : '';
}

/**
 * Convert a Unix timestamp (seconds) to a YYYY-MM-DD date string.
 *
 * data-ts values represent midnight of the day column in Pacific time.
 * Midnight PT (UTC-7/8) corresponds to 07:00–08:00 UTC the same calendar
 * date, so toISOString().slice(0,10) always returns the correct local date.
 *
 * Error-handling: returns null for falsy or unparseable inputs.
 *
 * @param {number} unixSeconds
 * @returns {string|null}
 */
function tsToDate(unixSeconds) {
  if (!unixSeconds) return null;
  const d = new Date(unixSeconds * 1000);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse all appointments from a weekly schedule page HTML.
 *
 * Pure function — no I/O, no side effects. Suitable for unit testing with a
 * fixture HTML string and no mocking.
 *
 * Strategy: match every <a data-id="..."> block (all schedule appointment
 * links carry data-id). The same external_id may appear in multiple day
 * columns for multi-day events — this is intentional; each
 * (external_id, appointment_date) pair maps to a distinct DB row. No
 * cross-column deduplication is done here; the upsert layer handles that.
 *
 * Error-handling strategy: per-event errors skip that event (with a warning)
 * and never abort the parse. The caller always receives the subset of events
 * that were successfully parsed.
 *
 * @param {string} html - Full weekly schedule page HTML
 * @returns {Array<Object>} Flat array of appointment objects ready for upsert
 */
export function parseDaytimeSchedulePage(html) {
  const appointments = [];

  // Match every <a> block carrying a data-id attribute.
  // Appointment links have no nested <a> elements, so non-greedy [\s\S]*? is safe.
  const blockRe = /<a\b([^>]*\bdata-id="[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = blockRe.exec(html)) !== null) {
    const attrStr = m[1];
    const inner = m[2];

    // Guard: only process /schedule/a/ appointment links. Other <a data-id>
    // elements (e.g. nav links) are discarded here.
    const href = attr(attrStr, 'href') || '';
    if (!href.includes('/schedule/a/')) continue;

    const externalId = attr(attrStr, 'data-id');
    if (!externalId) continue;

    // --- Date resolution ---
    // Decision: data-ts is the day-column's midnight timestamp. If missing or
    // unparseable, the event cannot be dated → skip and warn.
    const dayTsRaw = parseInt(attr(attrStr, 'data-ts') || '0', 10);
    const appointmentDate = tsToDate(dayTsRaw);
    if (!appointmentDate) {
      logWarn(`Skipping event ${externalId} — unparseable data-ts: "${attr(attrStr, 'data-ts')}"`);
      continue;
    }

    // --- Scalar data attributes ---
    const seriesId = attr(attrStr, 'data-series') || null;
    const startTsRaw = parseInt(attr(attrStr, 'data-start') || '0', 10);
    const status = parseInt(attr(attrStr, 'data-status') || '0', 10);
    const classes = attr(attrStr, 'class') || '';

    // --- Worker extraction ---
    // Decision: ew-{uid} class identifies the assigned worker.
    // uid 0 = no worker (boardings). Unknown uid = warn, still store.
    const workerMatch = classes.match(/\bew-(\d+)\b/);
    const workerExternalId = workerMatch ? parseInt(workerMatch[1], 10) : 0;
    if (workerMatch && !(workerExternalId in KNOWN_WORKERS)) {
      logWarn(
        `Unknown worker uid ${workerExternalId} on event ${externalId} (${appointmentDate})` +
          ' — add to KNOWN_WORKERS constant'
      );
    }

    // --- Service classification ---
    // Decision: cat-{id} and ser-{id} classes carry category and service IDs.
    // Unknown cat-id → serviceCategory is null but event is still stored; warn.
    const catMatch = classes.match(/\bcat-(\d+)\b/);
    const serMatch = classes.match(/\bser-(\d+)\b/);
    const serviceCatId = catMatch ? parseInt(catMatch[1], 10) : null;
    const serviceId = serMatch ? parseInt(serMatch[1], 10) : null;
    const serviceCategory = serviceCatId != null ? (SERVICE_CATS[serviceCatId] ?? null) : null;
    if (serviceCatId != null && !SERVICE_CATS[serviceCatId]) {
      logWarn(
        `Unknown service cat-${serviceCatId} on event ${externalId} — update SERVICE_CATS constant`
      );
    }

    // --- Multi-day span flags ---
    // appt-after = event continues into days after this column → is_multiday_start
    // appt-before = event started in days before this column  → is_multiday_end
    const isMultidayStart = /\bappt-after\b/.test(classes);
    const isMultidayEnd = /\bappt-before\b/.test(classes);

    // --- Inner element text ---
    const title = innerText(inner, 'day-event-title');
    const displayTime = innerText(inner, 'day-event-time');
    const clientName = innerText(inner, 'event-client');

    // client_uid: data-uid on the .event-clients-pets wrapper. The attribute
    // may appear before or after the class attribute, so scan the inner block
    // for any data-uid value (only one per event block).
    const clientUidMatch = inner.match(/data-uid="(\d+)"/);
    const clientUid = clientUidMatch ? parseInt(clientUidMatch[1], 10) : null;

    // --- Pet IDs and names ---
    // Pet IDs come from data-pet on .event-pet-wrapper elements.
    // Pet names come from inner text of .event-pet spans.
    const petIds = [];
    const petIdRe = /data-pet="(\d+)"/g;
    let pw;
    while ((pw = petIdRe.exec(inner)) !== null) {
      petIds.push(parseInt(pw[1], 10));
    }

    const petNames = [];
    const petNameRe = /class="[^"]*\bevent-pet\b[^"]*"[^>]*>([^<]+)</g;
    let pn;
    while ((pn = petNameRe.exec(inner)) !== null) {
      const name = decodeEntities(pn[1].trim());
      if (name) petNames.push(name);
    }

    // Decision: zero pet IDs on a non-boarding is unexpected — warn so we can
    // investigate whether the HTML structure changed.
    if (petIds.length === 0) {
      logWarn(`No pet IDs on event ${externalId} (${appointmentDate}, cat-${serviceCatId})`);
    }

    const isPickup = PICKUP_RE.test(title) || PICKUP_RE.test(displayTime);

    appointments.push({
      external_id: externalId,
      series_id: seriesId,
      appointment_date: appointmentDate,
      worker_external_id: workerExternalId,
      service_category: serviceCategory,
      service_cat_id: serviceCatId,
      service_id: serviceId,
      title: title || null,
      status,
      start_ts: startTsRaw || null,
      day_ts: dayTsRaw || null,
      display_time: displayTime || null,
      client_uid: clientUid,
      client_name: clientName || null,
      pet_ids: petIds,
      pet_names: petNames,
      is_pickup: isPickup,
      is_multiday_start: isMultidayStart,
      is_multiday_end: isMultidayEnd,
    });
  }

  // Summary log: break down by service category and date span so a parse
  // regression (e.g. all DC appointments suddenly missing) is immediately
  // visible without digging through per-event warn logs.
  const byCategory = {};
  const dates = new Set();
  for (const a of appointments) {
    const cat = a.service_category ?? 'unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (a.appointment_date) dates.add(a.appointment_date);
  }
  const catSummary = Object.entries(byCategory).map(([k, v]) => `${k}: ${v}`).join(', ');
  log(`Parsed ${appointments.length} appointments — ${catSummary || 'none'} across ${dates.size} date(s)`);
  return appointments;
}

/**
 * Upsert a batch of daytime appointments into the daytime_appointments table.
 *
 * Strategy: deduplicate the input batch by (external_id, appointment_date)
 * before sending — prevents Supabase errors when two fetched pages overlap on
 * the same week and return the same event twice. Last occurrence wins.
 *
 * onConflict='external_id,appointment_date' means a re-sync of the same day
 * updates status/times/pets in place rather than inserting a duplicate row.
 *
 * Error-handling: a Supabase-level error is logged and reported in the return
 * value; it does NOT throw so the cron caller can decide whether to treat it
 * as fatal.
 *
 * @param {Object} supabase              - Supabase client (service-role for cron)
 * @param {Array<Object>} appointments   - Output from parseDaytimeSchedulePage
 * @returns {Promise<{ upserted: number, errors: number }>}
 */
export async function upsertDaytimeAppointments(supabase, appointments) {
  // Decision: nothing to do → skip the DB round-trip entirely.
  if (appointments.length === 0) {
    log('No daytime appointments to upsert — skipping');
    return { upserted: 0, errors: 0 };
  }

  // Deduplicate by composite key; last occurrence wins (more recent parse data).
  const seen = new Map();
  for (const appt of appointments) {
    seen.set(`${appt.external_id}|${appt.appointment_date}`, appt);
  }
  const deduped = Array.from(seen.values());

  if (deduped.length < appointments.length) {
    log(`Deduped ${appointments.length} → ${deduped.length} before upsert`);
  }

  log(`Upserting ${deduped.length} daytime appointments`);

  const { error } = await supabase
    .from('daytime_appointments')
    .upsert(deduped, { onConflict: 'external_id,appointment_date' });

  if (error) {
    // Decision: log details for diagnosis; return error count so the cron
    // health record captures the failure without crashing the whole cron run.
    logWarn(`Upsert failed — ${error.message} (code: ${error.code})`);
    return { upserted: 0, errors: deduped.length };
  }

  log(`Upserted ${deduped.length} daytime appointments`);
  return { upserted: deduped.length, errors: 0 };
}
