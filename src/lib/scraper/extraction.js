/**
 * Appointment detail extraction module
 * @requirements REQ-102
 */

import { SCRAPER_CONFIG } from './config.js';
import { authenticatedFetch, isAuthenticated } from './auth.js';

/**
 * Extract appointment details from HTML
 * @param {string} html - Appointment detail page HTML
 * @param {string} sourceUrl - URL of the page (for reference)
 * @returns {Object} Extracted appointment data
 */
export function parseAppointmentPage(html, sourceUrl = '') {
  return {
    source_url: sourceUrl,

    // Appointment info
    service_type: extractText(html, SCRAPER_CONFIG.selectors.serviceType),
    status: extractText(html, SCRAPER_CONFIG.selectors.status),
    scheduled_check_in: extractText(html, SCRAPER_CONFIG.selectors.checkIn),
    scheduled_check_out: extractText(html, SCRAPER_CONFIG.selectors.checkOut),
    check_in_datetime: parseDateTime(extractText(html, SCRAPER_CONFIG.selectors.checkIn)),
    check_out_datetime: parseDateTime(extractText(html, SCRAPER_CONFIG.selectors.checkOut)),
    duration: extractText(html, SCRAPER_CONFIG.selectors.duration),
    assigned_staff: extractText(html, SCRAPER_CONFIG.selectors.assignedStaff),

    // Client info
    client_name: extractText(html, SCRAPER_CONFIG.selectors.clientName),
    client_email_primary: extractEmail(html, SCRAPER_CONFIG.selectors.clientEmail),
    client_email_secondary: extractSecondaryEmail(html),
    client_phone: extractPhone(html, SCRAPER_CONFIG.selectors.clientPhone),
    client_address: extractText(html, SCRAPER_CONFIG.selectors.clientAddress),

    // Instructions
    access_instructions: extractTextByLabel(html, ['access', 'entry', 'key', 'gate']),
    drop_off_instructions: extractTextByLabel(html, ['drop off', 'drop-off', 'arrival']),
    special_notes: extractTextByLabel(html, ['special notes', 'notes', 'additional']),

    // Pet info
    pet_name: extractText(html, SCRAPER_CONFIG.selectors.petName),
    pet_photo_url: extractImageUrl(html, ['pet', 'dog', 'photo']),
    pet_birthdate: parseBirthdate(extractText(html, SCRAPER_CONFIG.selectors.petBirthdate)),
    pet_breed: extractText(html, SCRAPER_CONFIG.selectors.petBreed),
    pet_breed_type: extractBreedType(html),
    pet_food_allergies: extractTextByLabel(html, ['food', 'allergies', 'diet']),
    pet_health_mobility: extractTextByLabel(html, ['health', 'mobility', 'medical']),
    pet_medications: extractTextByLabel(html, ['medication', 'medicine', 'prescription']),
    pet_veterinarian: extractVetInfo(html),
    pet_behavioral: extractTextByLabel(html, ['behavioral', 'behavior', 'temperament']),
    pet_bite_history: extractTextByLabel(html, ['bite', 'aggression', 'incident']),
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
 * Extract email from HTML
 * @param {string} html
 * @param {string} [selectorPattern]
 * @returns {string|null}
 */
function extractEmail(html, selectorPattern) {
  // First try selector
  if (selectorPattern) {
    const text = extractText(html, selectorPattern);
    if (text && text.includes('@')) {
      return text;
    }
  }

  // Fallback to email pattern matching
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = html.match(emailPattern);
  return match ? match[0] : null;
}

/**
 * Extract secondary email from HTML
 * @param {string} html
 * @returns {string|null}
 */
function extractSecondaryEmail(html) {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = html.match(emailPattern) || [];
  const uniqueEmails = [...new Set(emails)];
  return uniqueEmails.length > 1 ? uniqueEmails[1] : null;
}

/**
 * Extract phone number from HTML
 * @param {string} html
 * @param {string} [selectorPattern]
 * @returns {string|null}
 */
function extractPhone(html, selectorPattern) {
  // First try selector
  if (selectorPattern) {
    const text = extractText(html, selectorPattern);
    if (text) {
      const phone = text.match(/[\d\s\-().+]+/);
      if (phone && phone[0].replace(/\D/g, '').length >= 10) {
        return phone[0].trim();
      }
    }
  }

  // Fallback to phone pattern matching
  const phonePattern = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const match = html.match(phonePattern);
  return match ? match[0] : null;
}

/**
 * Extract image URL from HTML
 * @param {string} html
 * @param {string[]} keywords
 * @returns {string|null}
 */
function extractImageUrl(html, keywords) {
  // Look for img tags near keywords
  for (const keyword of keywords) {
    const pattern = new RegExp(
      `<img[^>]*(?:${keyword})[^>]*src="([^"]+)"`,
      'i'
    );
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Try reverse pattern (src before keyword)
  for (const keyword of keywords) {
    const pattern = new RegExp(
      `<img[^>]*src="([^"]+)"[^>]*(?:${keyword})`,
      'i'
    );
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract text by looking for labels
 * @param {string} html
 * @param {string[]} labelKeywords
 * @returns {string|null}
 */
function extractTextByLabel(html, labelKeywords) {
  for (const keyword of labelKeywords) {
    // Pattern: Label: Value or Label</...>Value
    const patterns = [
      new RegExp(`${keyword}[:\\s]*</[^>]+>\\s*([^<]+)`, 'i'),
      new RegExp(`${keyword}[:\\s]+([^<]+)`, 'i'),
      new RegExp(`>${keyword}</[^>]+>\\s*<[^>]+>([^<]+)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const text = cleanText(match[1]);
        if (text && text.length > 0) {
          return text;
        }
      }
    }
  }

  return null;
}

/**
 * Extract breed type (e.g., "Large", "Small")
 * @param {string} html
 * @returns {string|null}
 */
function extractBreedType(html) {
  const patterns = [
    /breed\s*type[:\s]*([^<]+)/i,
    /size[:\s]*(small|medium|large|giant|toy)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return cleanText(match[1]);
    }
  }

  return null;
}

/**
 * Extract veterinarian information
 * @param {string} html
 * @returns {Object|null}
 */
function extractVetInfo(html) {
  const vetSection = html.match(/veterinarian[^]*?(?=<\/(?:div|section|table)>)/i);
  if (!vetSection) return null;

  const section = vetSection[0];
  const name = extractTextByLabel(section, ['vet', 'clinic', 'hospital']);
  const phone = extractPhone(section);
  const address = extractTextByLabel(section, ['address', 'location']);

  if (!name && !phone) return null;

  return {
    name,
    phone,
    address,
  };
}

/**
 * Parse date/time string to ISO format
 * @param {string|null} dateStr
 * @returns {string|null}
 */
function parseDateTime(dateStr) {
  if (!dateStr) return null;

  try {
    // Handle common formats
    // "PM, Saturday, December 21, 2025" -> "2025-12-21T17:00:00Z"
    // "AM, Monday, December 23, 2025" -> "2025-12-23T10:00:00Z"

    const isPM = /pm/i.test(dateStr);
    const isAM = /am/i.test(dateStr);

    // Extract date parts
    const months = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };

    const monthMatch = dateStr.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)/i);
    const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
    const yearMatch = dateStr.match(/\b(20\d{2})\b/);

    if (monthMatch && dayMatch && yearMatch) {
      const month = months[monthMatch[0].toLowerCase()];
      const day = parseInt(dayMatch[1], 10);
      const year = parseInt(yearMatch[1], 10);

      // Default times: PM = 5:00 PM, AM = 10:00 AM
      const hour = isPM ? 17 : (isAM ? 10 : 12);

      const date = new Date(Date.UTC(year, month, day, hour, 0, 0));
      return date.toISOString();
    }

    // Try native Date parsing as fallback
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch {
    // Parsing failed
  }

  return null;
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

export default {
  parseAppointmentPage,
  fetchAppointmentDetails,
};
