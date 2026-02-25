/**
 * Appointment detail extraction module
 * @requirements REQ-102
 */

import { SCRAPER_CONFIG } from './config.js';
import { authenticatedFetch, isAuthenticated } from './auth.js';

/**
 * Parse check-in and check-out dates from a service_type string.
 *
 * The external site encodes boarding dates directly in the appointment title:
 *   "2/13-18"          → Feb 13 – Feb 18 (same month)
 *   "2/14-15am"        → Feb 14 – Feb 15 AM
 *   "2/15-21"          → Feb 15 – Feb 21
 *   "3/3-19 (Thur)"    → Mar 3  – Mar 19 (ignore suffix)
 *   "B/O Pepper 2/9PM-17" → Feb 9 – Feb 17 (ignore leading label)
 *   "2/28-3/5"         → Feb 28 – Mar 5 (cross-month)
 *
 * Returns { checkIn: Date, checkOut: Date } or null if the pattern is not found.
 *
 * @param {string|null} serviceType
 * @param {number} [year] - Calendar year (defaults to current year)
 * @returns {{ checkIn: Date, checkOut: Date } | null}
 */
export function parseServiceTypeDates(serviceType, year = new Date().getFullYear()) {
  if (!serviceType) return null;

  // Match M/D[am|pm]-D (same month) or M/D[am|pm]-M/D (cross-month)
  const match = serviceType.match(
    /(\d{1,2})\/(\d{1,2})(?:am|pm)?-(\d{1,2})(?:\/(\d{1,2}))?(?:am|pm)?/i
  );
  if (!match) return null;

  const startMonth = parseInt(match[1], 10) - 1; // 0-indexed
  const startDay   = parseInt(match[2], 10);

  let endMonth, endDay;
  if (match[4]) {
    // Cross-month form: M/D-M/D
    endMonth = parseInt(match[3], 10) - 1;
    endDay   = parseInt(match[4], 10);
  } else {
    // Same-month form: M/D-D
    endMonth = startMonth;
    endDay   = parseInt(match[3], 10);
    // If end day is before start day, the stay crosses into the next month
    if (endDay < startDay) {
      endMonth = (startMonth + 1) % 12;
    }
  }

  return {
    checkIn:  new Date(year, startMonth, startDay),
    checkOut: new Date(year, endMonth,   endDay),
  };
}

/**
 * Extract appointment details from HTML
 * @param {string} html - Appointment detail page HTML
 * @param {string} sourceUrl - URL of the page (for reference)
 * @returns {Object} Extracted appointment data
 */
export function parseAppointmentPage(html, sourceUrl = '') {
  // h1 is null for "Boarding (Nights)" appointments (no h1 on that page type).
  // Fall back to the <title> tag, which always has the appointment name.
  const serviceType = extractText(html, SCRAPER_CONFIG.selectors.serviceType)
                    || extractPageTitle(html);

  // Primary: parse dates from the service_type title (e.g. "2/13-18" → Feb 13–18).
  // The title date is the accurate boarding range per the business owner.
  // The system timestamp (data-start_scheduled) can be off by a day (appointment
  // creation time vs actual check-in date).
  // Fallback: use system timestamps for appointments without dates in the title
  // (e.g. "Boarding (Nights)").
  let checkInDatetime  = null;
  let checkOutDatetime = null;
  const parsedDates = parseServiceTypeDates(serviceType);
  if (parsedDates) {
    checkInDatetime  = parsedDates.checkIn.toISOString();
    checkOutDatetime = parsedDates.checkOut.toISOString();
  } else {
    const timestamps = extractScheduledTimestamps(html);
    checkInDatetime  = timestamps?.checkIn  || null;
    checkOutDatetime = timestamps?.checkOut || null;
  }

  return {
    source_url: sourceUrl,

    // Appointment info
    service_type: serviceType,
    status: extractText(html, SCRAPER_CONFIG.selectors.status),
    scheduled_check_in: null,
    scheduled_check_out: null,
    check_in_datetime: checkInDatetime,
    check_out_datetime: checkOutDatetime,
    duration: extractDuration(html),
    assigned_staff: null, // not shown for overnight boardings

    // Client info
    client_name: extractText(html, SCRAPER_CONFIG.selectors.clientName),
    client_email_primary: extractEmailFromDataAttr(html),
    client_email_secondary: null,
    client_phone: extractPhoneFromMobileContact(html),
    client_address: extractAddressFromDataAttr(html),

    // Instructions
    access_instructions: extractByLabelContains(html, 'Access Home or Apartment'),
    drop_off_instructions: extractByLabelContains(html, 'Drop Off'),
    special_notes: extractAppointmentNotes(html),

    // Pet info
    pet_name: extractText(html, SCRAPER_CONFIG.selectors.petName),
    all_pet_names: extractAllPetNames(html),
    pet_photo_url: null,
    pet_birthdate: parseBirthdate(extractByLabelContains(html, 'Birthdate')),
    pet_breed: extractByLabelContains(html, 'Breed(s)'),
    pet_breed_type: extractByLabelContains(html, 'Breed Type'),
    pet_food_allergies: extractByLabelContains(html, 'Food Allergies'),
    pet_health_mobility: extractByLabelContains(html, 'Health and Mobility'),
    pet_medications: extractByLabelContains(html, 'Medications'),
    pet_veterinarian: extractByLabelContains(html, 'Veterinarian'),
    pet_behavioral: extractByLabelContains(html, 'Behavioral'),
    pet_bite_history: extractByLabelContains(html, 'Bite History'),

    // Pricing (REQ-200): null when #confirm-price is absent (not an error)
    pricing: extractPricing(html),
  };
}

/**
 * Fetch and parse appointment details
 * @param {string} appointmentId - External appointment ID
 * @param {string} [timestamp] - Timestamp from URL (if required)
 * @returns {Promise<Object>} Extracted appointment data
 */
export async function fetchAppointmentDetails(appointmentId, timestamp = '') {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated. Call authenticate() first.');
  }

  const url = timestamp
    ? `${SCRAPER_CONFIG.baseUrl}/schedule/a/${appointmentId}/${timestamp}`
    : `${SCRAPER_CONFIG.baseUrl}/schedule/a/${appointmentId}`;

  const response = await authenticatedFetch(url, {
    timeout: SCRAPER_CONFIG.pageTimeout,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch appointment ${appointmentId}: ${response.status}`);
  }

  const html = await response.text();

  // Check if we need to re-authenticate
  if (html.includes('login') && html.includes('password')) {
    throw new Error('Session expired. Re-authentication required.');
  }

  const data = parseAppointmentPage(html, url);
  data.external_id = appointmentId;

  return data;
}

// ---------------------------------------------------------------------------
// Helpers backed by real HTML structure (verified 2026-02-19)
// ---------------------------------------------------------------------------

/**
 * Extract appointment title from the <title> tag.
 * Used as fallback when the h1 is absent (e.g. "Boarding (Nights)" pages).
 * Strips the site name suffix: "Boarding (Nights) | A Girl and Your Dog" → "Boarding (Nights)"
 */
function extractPageTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!match) return null;
  // Strip site name suffix (e.g., " | A Girl and Your Dog")
  return match[1].replace(/\s*\|[^|]*$/, '').trim() || null;
}

/**
 * Extract scheduled check-in and check-out timestamps from the #when-wrapper
 * data attributes. Returns ISO strings, or null if the element is not found.
 * These Unix timestamps (seconds) are more reliable than parsing service_type.
 */
function extractScheduledTimestamps(html) {
  const tagMatch = html.match(/<div[^>]*id="when-wrapper"[^>]*>/);
  if (!tagMatch) return null;
  const tag = tagMatch[0];
  const startMatch = tag.match(/data-start_scheduled="(\d+)"/);
  const endMatch   = tag.match(/data-end_scheduled="(\d+)"/);
  if (!startMatch || !endMatch) return null;
  return {
    checkIn:  new Date(parseInt(startMatch[1], 10) * 1000).toISOString(),
    checkOut: new Date(parseInt(endMatch[1],   10) * 1000).toISOString(),
  };
}

/**
 * Extract client email from the data-emails attribute on the message button.
 * More reliable than a global regex scan (which can match unrelated emails).
 */
function extractEmailFromDataAttr(html) {
  const match = html.match(/data-emails=\s*"([^"]+)"/);
  return match ? match[1].trim() : null;
}

/**
 * Extract phone from the data-value attribute on the .mobile-contact element.
 * Returns the raw value (e.g. "+14156065390"), not the formatted display text.
 */
function extractPhoneFromMobileContact(html) {
  // Attribute order in the real HTML: class first, then data-value
  const m = html.match(/class="mobile-contact"[^>]*data-value="([^"]+)"/) ||
            html.match(/data-value="([^"]+)"[^>]*class="mobile-contact"/);
  return m ? m[1].trim() : null;
}

/**
 * Extract client address from the data-address attribute.
 */
function extractAddressFromDataAttr(html) {
  const match = html.match(/data-address="([^"]+)"/);
  return match ? match[1].trim() : null;
}

/**
 * Extract scheduled duration from the .scheduled-duration element.
 * e.g. "(Scheduled: 10 d)" → "10 d"
 */
function extractDuration(html) {
  const match = html.match(/class="scheduled-duration"[^>]*>\(Scheduled:\s*([^)]+)\)/);
  return match ? match[1].trim() : null;
}

/**
 * Extract a field value by matching its label in the .field-label / .field-value
 * div pattern used throughout the appointment detail page.
 *
 * The real HTML structure is:
 *   <div class="field-label">LABEL TEXT</div>
 *   <div class="field-value">VALUE (may include <br/> tags)</div>
 *
 * @param {string} html
 * @param {string} labelSubstring - Case-insensitive substring to match in the label
 * @returns {string|null}
 */
function extractByLabelContains(html, labelSubstring) {
  const escaped = labelSubstring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `class="field-label">[^<]*${escaped}[^<]*<\\/div>\\s*<div[^>]*class="field-value"[^>]*>([\\s\\S]*?)<\\/div>`,
    'i'
  );
  const match = html.match(pattern);
  if (!match) return null;
  const raw = match[1]
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  return raw || null;
}

/**
 * Extract appointment notes from the .notes-wrapper section.
 * Joins all note texts with newlines.
 */
function extractAppointmentNotes(html) {
  const pattern = /class="note"[^>]*>([^<]+)/g;
  const notes = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const text = cleanText(match[1]);
    if (text) notes.push(text);
  }
  return notes.length ? notes.join('\n') : null;
}

// ---------------------------------------------------------------------------

/**
 * Extract text from HTML using CSS selector pattern
 * @param {string} html
 * @param {string} selectorPattern - Comma-separated selectors
 * @returns {string|null}
 */
function extractText(html, selectorPattern) {
  if (!selectorPattern) return null;

  const selectors = selectorPattern.split(',').map(s => s.trim());

  for (const selector of selectors) {
    const pattern = selectorToRegex(selector);
    const match = html.match(pattern);
    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  return null;
}

/**
 * Convert CSS selector to regex pattern
 * @param {string} selector
 * @returns {RegExp}
 */
function selectorToRegex(selector) {
  // Handle class selectors: .class-name
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    return new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([^<]+)`, 'i');
  }

  // Handle ID selectors: #id
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return new RegExp(`id="${id}"[^>]*>([^<]+)`, 'i');
  }

  // Handle data attribute selectors: [data-field="value"]
  if (selector.startsWith('[')) {
    const match = selector.match(/\[([^=]+)="([^"]+)"\]/);
    if (match) {
      return new RegExp(`${match[1]}="${match[2]}"[^>]*>([^<]+)`, 'i');
    }
  }

  // Handle tag selectors: h1, div, etc.
  return new RegExp(`<${selector}[^>]*>([^<]+)</${selector}>`, 'i');
}


/**
 * Parse birthdate string to date
 * @param {string|null} dateStr
 * @returns {string|null}
 */
function parseBirthdate(dateStr) {
  if (!dateStr) return null;

  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {
    // Parsing failed
  }

  return null;
}

/**
 * Extract all pet names from the appointment page in DOM order.
 * Single-pet appointments return a one-element array.
 * Used to identify secondary pets in multi-pet bookings.
 *
 * @param {string} html
 * @returns {string[]}
 */
function extractAllPetNames(html) {
  const names = [];
  const regex = /class="[^"]*event-pet[^"]*"[^>]*>([^<]+)/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const name = cleanText(m[1]);
    if (name) names.push(name);
  }
  return names;
}

/**
 * Clean extracted text
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Pricing extraction (REQ-200)
// ---------------------------------------------------------------------------

/**
 * Extract pricing information from the #confirm-price fieldset.
 *
 * Returns { total, lineItems } or null when the section is absent (null is
 * normal — not all appointments have machine-readable pricing).
 *
 * Parsing rules:
 *  - total:      regex /\$(\d+(?:\.\d+)?)/ on `.toggle-field.text.quote` text
 *  - data-rate:  parseFloat(attr) / 100  (stored as cents on the site)
 *  - data-qty:   parseFloat(attr) / 100  (stored as qty × 100 on the site)
 *  - data-amount: parseFloat(attr)       (already in dollars)
 *
 * Individual line items with missing attributes are skipped (warn + continue).
 * If the total text is unparseable the whole result is null (warn + return null).
 *
 * @requirements REQ-200
 * @param {string} html
 * @returns {{ total: number, lineItems: Array<{serviceName: string, rate: number, qty: number, amount: number}> } | null}
 */
export function extractPricing(html) {
  if (!html || !html.includes('id="confirm-price"')) return null;

  const fieldsetMatch = html.match(/<fieldset[^>]*id="confirm-price"[^>]*>([\s\S]*?)<\/fieldset>/i);
  if (!fieldsetMatch) {
    console.warn('[extractPricing] id="confirm-price" found in HTML but fieldset regex did not match');
    return null;
  }
  const fieldset = fieldsetMatch[1];
  console.log('[extractPricing] fieldset length:', fieldset.length,
    '| snippet:', fieldset.substring(0, 200).replace(/\s+/g, ' ').trim());

  // Extract total from the .toggle-field.text.quote anchor text.
  // The anchor is: <a class="btn toggle-field text quote">Total $750 <i ...></i></a>
  // We stop capture at the first <i> child or closing </a>.
  const totalAnchorMatch = fieldset.match(
    /class="[^"]*toggle-field[^"]*text[^"]*quote[^"]*"[^>]*>([\s\S]*?)(?:<i\b|<\/a>)/i
  );
  if (!totalAnchorMatch) {
    console.warn('[extractPricing] Could not find total anchor (.toggle-field.text.quote) in #confirm-price');
    return null;
  }
  const totalAmountMatch = totalAnchorMatch[1].match(/\$(\d+(?:\.\d+)?)/);
  if (!totalAmountMatch) {
    console.warn('[extractPricing] Could not parse total amount from anchor text:', totalAnchorMatch[1].trim());
    return null;
  }
  const total = parseFloat(totalAmountMatch[1]);
  console.log('[extractPricing] total:', total);

  // Collect service names from all .service-name spans in order.
  const serviceNames = [];
  const serviceNameRegex = /class="service-name"[^>]*>([^<]+)</gi;
  let nameMatch;
  while ((nameMatch = serviceNameRegex.exec(fieldset)) !== null) {
    serviceNames.push(nameMatch[1].trim());
  }
  console.log('[extractPricing] serviceNames:', serviceNames);

  // Collect the full opening tag of each .price div (for attribute parsing).
  // Real HTML uses multiple classes: class="price p-7 has-outstanding" — match
  // with \bprice\b so we catch "price" anywhere in the class list.
  const priceTags = [];
  const priceTagRegex = /<div[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>/gi;
  let priceTagMatch;
  while ((priceTagMatch = priceTagRegex.exec(fieldset)) !== null) {
    console.log('[extractPricing] price tag matched:', priceTagMatch[0].substring(0, 120).replace(/\s+/g, ' '));
    priceTags.push(priceTagMatch[0]);
  }
  console.log('[extractPricing] priceTags found:', priceTags.length);

  // If service names are present but NO price divs matched, extraction has failed —
  // the site structure may have changed. Throw so the caller can flag this appointment
  // as a bad data read rather than silently storing null rates.
  if (priceTags.length === 0 && serviceNames.length > 0) {
    const snippet = fieldset.substring(0, 500).replace(/\s+/g, ' ').trim();
    throw new Error(
      `[extractPricing] EXTRACTION FAILURE: found ${serviceNames.length} service name(s) but 0 .price divs matched. ` +
      `priceTagRegex=${priceTagRegex.source} | fieldset snippet: ${snippet}`
    );
  }

  // Determine number of pets from the pricing wrapper class (e.g., "pets-2").
  // Multi-pet appointments have numPets consecutive price divs per service.
  const petsMatch = fieldset.match(/\bpets-(\d+)\b/);
  const numPets = petsMatch ? parseInt(petsMatch[1], 10) : 1;
  console.log('[extractPricing] numPets:', numPets);

  // Pair service names with price tags.
  // For service i: first pet's div is at priceTags[i * numPets].
  // Rate and qty come from the first pet's div (per-dog; stored on the primary dog record).
  // Amount is summed across all pets (total charge for that service line).
  const lineItems = [];
  for (let i = 0; i < serviceNames.length; i++) {
    const priceIdx = i * numPets;
    if (priceIdx >= priceTags.length) break;
    try {
      const tag = priceTags[priceIdx];
      const rateMatch = tag.match(/data-rate="([^"]+)"/);
      const qtyMatch  = tag.match(/data-qty="([^"]+)"/);
      if (!rateMatch || !qtyMatch) {
        console.warn('[extractPricing] Missing price attributes for service:', serviceNames[i], '| tag:', tag);
        continue;
      }
      // Sum amounts across all pets for this service
      let serviceAmount = 0;
      for (let p = 0; p < numPets; p++) {
        const petTag = priceTags[priceIdx + p];
        if (petTag) {
          const amtMatch = petTag.match(/data-amount="([^"]+)"/);
          if (amtMatch) serviceAmount += parseFloat(amtMatch[1]);
        }
      }
      const item = {
        serviceName: serviceNames[i],
        rate:   parseFloat(rateMatch[1]) / 100,
        qty:    parseFloat(qtyMatch[1])  / 100,
        amount: serviceAmount,
      };
      console.log('[extractPricing] line item:', item);
      lineItems.push(item);
    } catch (err) {
      console.warn('[extractPricing] Error parsing line item:', serviceNames[i], err.message);
    }
  }

  // Build per-pet rate breakdown for multi-pet appointments.
  // perPetRates[p].nightRate = rate from the first non-day service for pet p.
  // perPetRates[p].dayRate   = rate from the first day service for pet p.
  // Single-pet appointments: one entry, rates match lineItems[x].rate.
  const perPetRates = [];
  const { dayServicePatterns } = SCRAPER_CONFIG;
  for (let p = 0; p < numPets; p++) {
    let petNightRate = null;
    let petDayRate = null;
    for (let i = 0; i < serviceNames.length; i++) {
      const tag = priceTags[i * numPets + p];
      if (!tag) continue;
      const rateMatch = tag.match(/data-rate="([^"]+)"/);
      if (!rateMatch) continue;
      const rate = parseFloat(rateMatch[1]) / 100;
      const isDayService = dayServicePatterns.some(dp => dp.test(serviceNames[i]));
      if (isDayService && petDayRate === null) petDayRate = rate;
      else if (!isDayService && petNightRate === null) petNightRate = rate;
    }
    perPetRates.push({ nightRate: petNightRate, dayRate: petDayRate });
  }

  return { total, lineItems, perPetRates };
}

export default {
  parseAppointmentPage,
  fetchAppointmentDetails,
  extractPricing,
};
