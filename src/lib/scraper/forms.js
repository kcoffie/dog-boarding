/**
 * Boarding forms scraper — fetches and stores boarding information forms
 * submitted by clients on the external booking site.
 *
 * Forms list: /pets/{external_pet_id}/forms
 * Form detail: /pets/{external_pet_id}/forms/7913/view/{submission_id}
 *
 * Form 7913 = "Boarding Information Form"
 *
 * @requirements REQ-501, REQ-502, REQ-505
 */

import { createSyncLogger } from './logger.js';
import { authenticatedFetch } from './auth.js';
import { SCRAPER_CONFIG } from './config.js';

const formsLogger = createSyncLogger('Forms');
const log = formsLogger.log;
const logWarn = formsLogger.warn;

/**
 * Priority field IDs shown first in the modal.
 * All other fields are shown after a divider.
 */
const PRIORITY_FIELD_IDS = [
  'field_184366', // CONFIRM ARRIVAL DATE
  'field_184367', // CONFIRM DEPARTURE DATE
  'field_239541', // ARRIVAL TIME
  'field_239567', // DEPARTURE TIME
  'field_184360', // FEEDING INSTRUCTIONS
  'field_184362', // MEDICATIONS/MEDICAL CONDITION
  'field_184363', // TRAVEL DETAILS AND BEST CONTACT
];

/**
 * Parse the forms list page for a pet.
 * Extracts submission IDs and submitted dates for form 7913 only.
 *
 * Uses regex parsing (no DOMParser) so it works in Node.js (cron) and browser.
 *
 * @param {string} html - HTML of /pets/{id}/forms page
 * @returns {Array<{submissionId: number, submissionUrl: string, submittedDate: string|null}>}
 *   Submissions in document order (typically newest first from the external site).
 */
export function parseFormsListPage(html) {
  const submissions = [];
  const seen = new Set();

  // Match <a href="/pets/{any}/forms/7913/view/{submissionId}">
  const linkRe = /href="([^"]*\/forms\/7913\/view\/(\d+))"/gi;
  let m;

  while ((m = linkRe.exec(html)) !== null) {
    const submissionId = parseInt(m[2], 10);
    if (seen.has(submissionId)) continue;
    seen.add(submissionId);

    const submissionUrl = m[1];

    // Look for a date in MM/DD/YYYY format within ~300 chars surrounding the link.
    // The external site typically shows submitted dates in the same table row.
    const start = Math.max(0, m.index - 300);
    const end = Math.min(html.length, m.index + 300);
    const context = html.slice(start, end);

    const dateMatch = context.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    const submittedDate = dateMatch ? dateMatch[1] : null;

    submissions.push({ submissionId, submissionUrl, submittedDate });
  }

  return submissions;
}

/**
 * Parse a form detail page.
 * Extracts all field labels + values, the submission date, and key date fields.
 *
 * Uses regex parsing (no DOMParser) so it works in Node.js and browser.
 *
 * @param {string} html - HTML of /pets/{id}/forms/7913/view/{sub_id} page
 * @returns {{
 *   formSubmittedAt: string|null,
 *   allFields: Array<{fieldId: string, label: string, value: string}>,
 *   form_arrival_date: string|null,   (YYYY-MM-DD)
 *   form_departure_date: string|null, (YYYY-MM-DD)
 * }}
 */
export function parseFormDetailPage(html) {
  const allFields = [];

  // Find each field row by its id="field_\d+" marker and look ahead for label + value.
  // Using a forward window avoids needing to match nested closing tags.
  const fieldMarkerRe = /id="(field_\d+)-wrapper"/gi;
  let markerMatch;

  while ((markerMatch = fieldMarkerRe.exec(html)) !== null) {
    const fieldId = markerMatch[1];
    // Look in a ~600-char window starting from the marker for label/value divs
    const window = html.slice(markerMatch.index, markerMatch.index + 600);
    const label = extractInnerText(window, 'field-label');
    const value = extractInnerText(window, 'field-value');

    if (label || value) {
      allFields.push({ fieldId, label: label.trim(), value: value.trim() });
    }
  }

  // Submission date: text like "submitted: 2/12/2026" in .form-meta .form-submitted
  const submittedMatch = html.match(/class="[^"]*form-submitted[^"]*"[^>]*>([^<]*)</i);
  let formSubmittedAt = null;
  if (submittedMatch) {
    const raw = submittedMatch[1].trim();
    // Strip leading "submitted:" label if present
    const cleaned = raw.replace(/^submitted:\s*/i, '').trim();
    formSubmittedAt = cleaned || null;
  }

  // Extract priority date fields and parse as YYYY-MM-DD
  const arrivalField = allFields.find(f => f.fieldId === 'field_184366');
  const departureField = allFields.find(f => f.fieldId === 'field_184367');

  const form_arrival_date = parseMMDDYYYYtoISO(arrivalField?.value || null);
  const form_departure_date = parseMMDDYYYYtoISO(departureField?.value || null);

  return { formSubmittedAt, allFields, form_arrival_date, form_departure_date };
}

/**
 * Extract text content from the first element with the given class within an HTML string.
 * Strips tags from the result. Returns '' if not found.
 *
 * @param {string} html
 * @param {string} cls - CSS class to search for (partial match allowed)
 * @returns {string}
 */
function extractInnerText(html, cls) {
  const re = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/`, 'i');
  const m = html.match(re);
  if (!m) return '';
  // Strip HTML tags and decode basic entities
  return m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

/**
 * Parse a date string in M/D/YYYY or MM/DD/YYYY format to YYYY-MM-DD (ISO date).
 * Returns null if the string is null, empty, or unparseable.
 *
 * @param {string|null} str
 * @returns {string|null}
 */
export function parseMMDDYYYYtoISO(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = String(parseInt(m[1], 10)).padStart(2, '0');
  const day = String(parseInt(m[2], 10)).padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Choose the best matching form submission for a boarding.
 *
 * Primary: return the most recent submission whose submittedDate is on or before
 *   the boarding's arrival date.
 * Fallback: if all submissions are after the arrival date, return the most recent
 *   overall (index 0, as the external site lists newest first).
 * Returns null if submissions array is empty.
 *
 * @param {Array<{submissionId: number, submittedDate: string|null}>} submissions
 * @param {{ arrival_datetime: string }} boarding
 * @returns {number|null} submissionId or null
 */
export function findFormForBoarding(submissions, boarding) {
  if (!submissions || submissions.length === 0) return null;

  const boardingArrival = new Date(boarding.arrival_datetime);
  boardingArrival.setHours(23, 59, 59, 999); // include submissions on the same day

  log(`[Forms] 🗓️  Matching against boarding arrival: ${boardingArrival.toISOString()} (${submissions.length} submissions)`);

  // Filter to submissions at or before boarding arrival
  const candidates = submissions.filter(s => {
    if (!s.submittedDate) {
      log(`[Forms]   sub ${s.submissionId}: no date → ✅ included`);
      return true;
    }
    const isoDate = parseMMDDYYYYtoISO(s.submittedDate);
    if (!isoDate) {
      log(`[Forms]   sub ${s.submissionId}: unparseable date "${s.submittedDate}" → ✅ included`);
      return true;
    }
    const subDate = new Date(isoDate + 'T00:00:00');
    const passes = subDate <= boardingArrival;
    log(`[Forms]   sub ${s.submissionId}: submitted ${s.submittedDate} (${isoDate}) → ${passes ? '✅ candidate' : '❌ after arrival'}`);
    return passes;
  });

  if (candidates.length > 0) {
    // Submissions are newest first; first candidate is the most recent match
    return candidates[0].submissionId;
  }

  // All submissions are after boarding arrival — return most recent overall
  logWarn(`[Forms] ⚠️ All submissions after boarding arrival — using most recent (sub ${submissions[0].submissionId})`);
  return submissions[0].submissionId;
}

/**
 * Fetch, parse, and store the boarding information form for a given boarding.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} boardingId - UUID of the boarding
 * @param {string} externalPetId - External pet ID (e.g. "90043")
 * @param {string} dogName - Dog name for logging
 * @returns {Promise<void>}
 */
export async function fetchAndStoreBoardingForm(supabase, boardingId, externalPetId, dogName) {
  log(`[Forms] 🔍 Fetching forms list for pet ${externalPetId} (${dogName})`);

  // 1. Fetch the forms list page
  const listUrl = `${SCRAPER_CONFIG.baseUrl}/pets/${externalPetId}/forms`;
  const listResponse = await authenticatedFetch(listUrl);
  if (!listResponse.ok) {
    throw new Error(`Forms list fetch failed: ${listResponse.status} for pet ${externalPetId}`);
  }
  const listHtml = await listResponse.text();

  // Check for session expiry
  if (listHtml.includes('login') && listHtml.includes('password')) {
    throw new Error('Session expired. Re-authentication required.');
  }

  // 2. Parse the forms list
  const submissions = parseFormsListPage(listHtml);
  log(`[Forms] 📋 Found ${submissions.length} submissions for form 7913 (pet ${externalPetId})`);

  if (submissions.length === 0) {
    log(`[Forms] ❌ No form 7913 submissions found for pet ${externalPetId}`);
    // Store an empty/null record so we don't keep re-fetching
    await supabase
      .from('boarding_forms')
      .upsert(
        {
          boarding_id: boardingId,
          external_pet_id: externalPetId,
          submission_url: listUrl,
          form_data: {},
          date_mismatch: false,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'boarding_id' }
      );
    return;
  }

  // 3. Load boarding record to get arrival/departure dates for date matching
  const { data: boarding, error: boardingErr } = await supabase
    .from('boardings')
    .select('id, arrival_datetime, departure_datetime')
    .eq('id', boardingId)
    .single();

  if (boardingErr || !boarding) {
    throw new Error(`Boarding ${boardingId} not found: ${boardingErr?.message}`);
  }

  log(`[Forms] 📅 Boarding dates: arrival=${boarding.arrival_datetime}, departure=${boarding.departure_datetime}`);

  // 4. Find the best matching submission
  const submissionId = findFormForBoarding(submissions, boarding);
  if (submissionId === null) {
    logWarn(`[Forms] ❌ No suitable submission for boarding ${boardingId} (pet ${externalPetId})`);
    return;
  }

  const selectedSub = submissions.find(s => s.submissionId === submissionId);
  log(`[Forms] 🎯 Boarding match: submission ${submissionId} (submitted ${selectedSub?.submittedDate || 'unknown'})`);

  // 5. Fetch the form detail page
  const detailUrl = selectedSub
    ? `${SCRAPER_CONFIG.baseUrl}${selectedSub.submissionUrl}`
    : `${SCRAPER_CONFIG.baseUrl}/pets/${externalPetId}/forms/7913/view/${submissionId}`;

  const detailResponse = await authenticatedFetch(detailUrl);
  if (!detailResponse.ok) {
    throw new Error(`Form detail fetch failed: ${detailResponse.status} (sub ${submissionId})`);
  }
  const detailHtml = await detailResponse.text();

  if (detailHtml.includes('login') && detailHtml.includes('password')) {
    throw new Error('Session expired. Re-authentication required.');
  }

  // 6. Parse the detail page
  const { formSubmittedAt, allFields, form_arrival_date, form_departure_date } = parseFormDetailPage(detailHtml);

  log(`[Forms] 🔍 Parsed ${allFields.length} field(s) from detail page (formSubmittedAt=${formSubmittedAt ?? 'null'})`);
  log(`[Forms] 📅 Form dates extracted: arrival=${form_arrival_date ?? 'null'}, departure=${form_departure_date ?? 'null'}`);
  if (allFields.length === 0) {
    logWarn(`[Forms] ⚠️ Zero fields parsed — detail HTML may not contain expected id="field_\\d+" elements`);
  }

  // 7. Compute date mismatch
  const boardingArrivalISO = boarding.arrival_datetime
    ? new Date(boarding.arrival_datetime).toISOString().slice(0, 10)
    : null;
  const boardingDepartureISO = boarding.departure_datetime
    ? new Date(boarding.departure_datetime).toISOString().slice(0, 10)
    : null;

  const date_mismatch =
    (form_arrival_date !== null && form_arrival_date !== boardingArrivalISO) ||
    (form_departure_date !== null && form_departure_date !== boardingDepartureISO);

  if (date_mismatch) {
    logWarn(
      `[Forms] ⚠️  Date mismatch: booking=${boardingArrivalISO}–${boardingDepartureISO},`,
      `form=${form_arrival_date}–${form_departure_date}`
    );
  }

  // 8. Organise form_data with priority fields first
  const priorityFields = PRIORITY_FIELD_IDS
    .map(fid => allFields.find(f => f.fieldId === fid))
    .filter(Boolean);
  const priorityIds = new Set(PRIORITY_FIELD_IDS);
  const otherFields = allFields.filter(f => !priorityIds.has(f.fieldId));

  const form_data = {
    priorityFields,
    otherFields,
    allFields,
  };

  // 9. Upsert into boarding_forms
  const { error: upsertErr } = await supabase
    .from('boarding_forms')
    .upsert(
      {
        boarding_id: boardingId,
        external_pet_id: externalPetId,
        submission_id: submissionId,
        submission_url: detailUrl,
        form_submitted_at: parseMMDDYYYYtoISO(formSubmittedAt) || null,
        form_arrival_date,
        form_departure_date,
        date_mismatch,
        form_data,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'boarding_id' }
    );

  if (upsertErr) throw upsertErr;

  log(`[Forms] ✅ Stored boarding form for boarding ${boardingId} (sub ${submissionId}, mismatch=${date_mismatch})`);
}

export default {
  parseFormsListPage,
  parseFormDetailPage,
  parseMMDDYYYYtoISO,
  findFormForBoarding,
  fetchAndStoreBoardingForm,
};
