/**
 * Schedule page parsing module
 * @requirements REQ-101
 */

import { SCRAPER_CONFIG } from './config.js';
import { authenticatedFetch, isAuthenticated } from './auth.js';
import { syncLogger } from './logger.js';

const log = syncLogger.log;
const logError = syncLogger.error;

/**
 * Parse appointment data from schedule page HTML using DOMParser.
 *
 * The external site renders appointment titles via JavaScript, so the fetched
 * HTML has empty title text nodes. We instead extract data from attributes and
 * child elements that ARE present in the static HTML:
 *   - id / timestamp / eventType / status  →  data-* attributes on <a>
 *   - petName   →  <span class="event-pet ...">
 *   - clientName →  <span class="event-client">
 *   - time       →  <div class="day-event-time">
 *   - title      →  <div class="day-event-title"> (date-range label, e.g. "1/31-2/1pm")
 *
 * @param {string} html - Schedule page HTML
 * @returns {Array<{id, url, timestamp, eventType, status, petName, clientName, time, title}>}
 */
export function parseSchedulePage(html) {
  const appointments = [];

  // DOMParser is available natively in browsers; jsdom provides it in tests.
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const links = doc.querySelectorAll('a[href*="/schedule/a/"]');

  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const urlMatch = href.match(/\/schedule\/a\/([^/]+)\/(\d+)/);
    if (!urlMatch) continue;

    const id = urlMatch[1];
    const timestamp = urlMatch[2];

    const petEl = link.querySelector('.event-pet');
    const clientEl = link.querySelector('.event-client');
    const timeEl = link.querySelector('.day-event-time');
    const titleEl = link.querySelector('.day-event-title');

    appointments.push({
      id,
      url: href.startsWith('http') ? href : `${SCRAPER_CONFIG.baseUrl}${href}`,
      timestamp,
      eventType: link.getAttribute('data-event_type') || '',
      status: link.getAttribute('data-status') || '',
      petName: petEl?.textContent?.trim() || '',
      clientName: clientEl?.textContent?.trim() || '',
      time: timeEl?.textContent?.trim() || '',
      title: titleEl?.textContent?.trim() || '',
    });
  }

  // Deduplicate by appointment ID (same appointment can appear on multiple schedule weeks)
  const unique = Array.from(new Map(appointments.map(a => [a.id, a])).values());

  log(`[Schedule] 🔍 Parsed ${unique.length} appointments from HTML (${html.length} chars)`);
  if (unique.length > 0) {
    const first = unique[0];
    log(`[Schedule] 🔍 First: id=${first.id}, pet="${first.petName}", client="${first.clientName}", time="${first.time}"`);
  }

  return unique;
}

/**
 * Filter to appointments that have meaningful data.
 *
 * NOTE: Boarding-type filtering now happens in sync.js after the detail page
 * is fetched, because the external site renders appointment type labels via
 * JavaScript (not present in the static schedule HTML). This function only
 * removes clearly empty/invalid entries.
 *
 * @param {Array} appointments
 * @returns {Array}
 */
export function filterBoardingAppointments(appointments) {
  // Keep all appointments that have at least an ID (they do — this is a safety check)
  return appointments.filter(appt => Boolean(appt.id));
}

/**
 * Build the schedule URL for a given start date.
 *
 * The external site ignores ?start=&end= query params — it always returns the
 * full schedule view.  The actual paginated URL format it uses internally is:
 *   /schedule/days-7/YYYY/M/D
 * where YYYY/M/D is the START date of the 7-day window to display.
 *
 * When startDate is provided we jump directly to the right week instead of
 * starting from the beginning of the schedule.
 *
 * @param {Date} [startDate]
 * @returns {string}
 */
function buildScheduleStartUrl(startDate) {
  if (!startDate) {
    return `${SCRAPER_CONFIG.baseUrl}/schedule`;
  }
  const y = startDate.getFullYear();
  const m = startDate.getMonth() + 1; // 0-indexed
  const d = startDate.getDate();
  return `${SCRAPER_CONFIG.baseUrl}/schedule/days-7/${y}/${m}/${d}`;
}

/**
 * Parse the start date from a schedule-page `time` string.
 *
 * Examples seen in the wild:
 *   "Feb 9, 4:58pm - 7:24pm"   → Feb 9
 *   "Feb 13, 11:49am ..."       → Feb 13
 *   "Feb 27, AM - PM"           → Feb 27
 *   "Apr 01, AM - Apr 13, PM"   → Apr 1
 *   "Pick-Up ( 9 am - 10 am )"  → null (no month)
 *
 * Returns a Date set to midnight local time on the parsed date, or null if
 * the string cannot be parsed.
 *
 * @param {string} timeStr
 * @param {number} [year] - Defaults to current year
 * @returns {Date|null}
 */
export function parseAppointmentStartDate(timeStr, year = new Date().getFullYear()) {
  if (!timeStr) return null;

  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const match = timeStr.match(/([A-Za-z]{3})\w*\s+(\d{1,2})/);
  if (!match) return null;

  const monthKey = match[1].toLowerCase();
  const day = parseInt(match[2], 10);
  const month = MONTHS[monthKey];
  if (month === undefined) return null;

  return new Date(year, month, day);
}

/**
 * Fetch and parse the schedule page
 * @param {Object} [options]
 * @param {Date} [options.startDate] - Start of date range
 * @param {Date} [options.endDate] - End of date range
 * @param {boolean} [options.boardingOnly=true] - Filter to boarding only
 * @returns {Promise<{appointments: Array, hasNextPage: boolean, nextPageUrl: string|null}>}
 */
export async function fetchSchedulePage(options = {}) {
  const { startDate, endDate, boardingOnly = true } = options;

  log(`[Schedule] fetchSchedulePage called with startDate=${startDate}, endDate=${endDate}`);

  if (!isAuthenticated()) {
    throw new Error('Not authenticated. Call authenticate() first.');
  }

  // Use the days-7 URL format to jump to the right week.
  // The ?start=&end= query params are ignored by the external site.
  const scheduleUrl = buildScheduleStartUrl(startDate);

  log(`[Schedule] Fetching URL: ${scheduleUrl}`);

  const response = await authenticatedFetch(scheduleUrl, {
    timeout: SCRAPER_CONFIG.pageTimeout,
  });

  log(`[Schedule] Response ok: ${response.ok}, status: ${response.status}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch schedule: ${response.status}`);
  }

  const html = await response.text();
  log(`[Schedule] Got HTML response, length: ${html.length}`);

  // Check if we need to re-authenticate (redirected to login)
  if (html.includes('login') && html.includes('password')) {
    logError(`[Schedule] Session expired - got login page`);
    throw new Error('Session expired. Re-authentication required.');
  }

  log(`[Schedule] Parsing schedule page...`);
  let appointments = parseSchedulePage(html);

  if (boardingOnly) {
    appointments = filterBoardingAppointments(appointments);
  }

  // Check for pagination
  const { hasNextPage, nextPageUrl } = parsePagination(html);

  return {
    appointments,
    hasNextPage,
    nextPageUrl,
  };
}

/**
 * Fetch all pages of schedule
 * @param {Object} [options]
 * @param {Date} [options.startDate]
 * @param {Date} [options.endDate]
 * @param {boolean} [options.boardingOnly=true]
 * @param {number} [options.maxPages=10]
 * @returns {Promise<Array<{id: string, url: string, title: string}>>}
 */
export async function fetchAllSchedulePages(options = {}) {
  const { maxPages = 10, ...fetchOptions } = options;
  const allAppointments = [];
  let currentUrl = null;
  let pageCount = 0;

  log(`[Schedule] 📄 Starting to fetch schedule pages (max: ${maxPages})`);
  log(`[Schedule] 📄 Options: startDate=${fetchOptions.startDate}, endDate=${fetchOptions.endDate}, boardingOnly=${fetchOptions.boardingOnly}`);

  while (pageCount < maxPages) {
    const pageStart = Date.now();
    log(`[Schedule] 📄 Fetching page ${pageCount + 1}${currentUrl ? ` (${currentUrl})` : ' (initial)'}`);

    let result;
    try {
      result = currentUrl
        ? await fetchSchedulePageByUrl(currentUrl, fetchOptions.boardingOnly)
        : await fetchSchedulePage(fetchOptions);
    } catch (fetchError) {
      logError(`[Schedule] ❌ Error fetching page ${pageCount + 1}: ${fetchError.message}`);
      throw fetchError;
    }

    const pageDuration = Date.now() - pageStart;
    log(`[Schedule] ⏱️ Page ${pageCount + 1}: found ${result.appointments.length} appointments in ${pageDuration}ms`);
    log(`[Schedule] 📄 Page ${pageCount + 1}: hasNextPage=${result.hasNextPage}, nextPageUrl=${result.nextPageUrl || 'none'}`);

    allAppointments.push(...result.appointments);
    pageCount++;

    if (!result.hasNextPage || !result.nextPageUrl) {
      log(`[Schedule] ✅ Finished fetching - no more pages`);
      break;
    }

    // Prevent infinite loop - check if nextPageUrl is the same as current
    if (result.nextPageUrl === currentUrl) {
      log(`[Schedule] ⚠️ Breaking loop - nextPageUrl same as current`);
      break;
    }

    // Early stop: if an endDate is set and every appointment with a parseable
    // start date on this page begins AFTER endDate, later pages won't help.
    // We ignore appointments whose time can't be parsed (daycare recurring
    // entries like "DC:FT") — those appear on every page and would otherwise
    // prevent the stop from ever firing.
    if (fetchOptions.endDate && result.appointments.length > 0) {
      const endDateMidnight = new Date(fetchOptions.endDate);
      endDateMidnight.setHours(23, 59, 59, 999);
      const parseableDates = result.appointments
        .map(appt => parseAppointmentStartDate(appt.time))
        .filter(Boolean);
      const allBeyondRange =
        parseableDates.length > 0 &&
        parseableDates.every(d => d > endDateMidnight);
      if (allBeyondRange) {
        log(`[Schedule] ✅ Early stop — all parseable dates on page ${pageCount} are beyond endDate`);
        break;
      }
    }

    currentUrl = result.nextPageUrl;

    // Rate limiting delay between pages
    await delay(SCRAPER_CONFIG.delayBetweenRequests);
  }

  // Deduplicate by ID
  let uniqueAppointments = Array.from(
    new Map(allAppointments.map(a => [a.id, a])).values()
  );

  // NOTE: We do NOT filter by startDate here. A boarding that started before
  // startDate (e.g. Feb 13) may still be active during the target window
  // (e.g. a 10-night stay ending Feb 23). Filtering by appointment start date
  // would incorrectly drop those. Date-range filtering happens in sync.js
  // after check_in_datetime / check_out_datetime are available from the detail page.

  log(`[Schedule] 📊 Total: ${uniqueAppointments.length} unique appointments from ${pageCount} pages`);

  return uniqueAppointments;
}

/**
 * Fetch schedule page by direct URL (for pagination)
 * @param {string} url
 * @param {boolean} [boardingOnly=true]
 * @returns {Promise<{appointments: Array, hasNextPage: boolean, nextPageUrl: string|null}>}
 */
async function fetchSchedulePageByUrl(url, boardingOnly = true) {
  const response = await authenticatedFetch(url, {
    timeout: SCRAPER_CONFIG.pageTimeout,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schedule page: ${response.status}`);
  }

  const html = await response.text();
  let appointments = parseSchedulePage(html);

  if (boardingOnly) {
    appointments = filterBoardingAppointments(appointments);
  }

  const { hasNextPage, nextPageUrl } = parsePagination(html);

  return {
    appointments,
    hasNextPage,
    nextPageUrl,
  };
}

/**
 * Parse pagination from HTML
 * @param {string} html
 * @returns {{hasNextPage: boolean, nextPageUrl: string|null}}
 */
function parsePagination(html) {
  // Look for common pagination patterns
  const nextPatterns = [
    /href="([^"]+)"[^>]*class="[^"]*next[^"]*"/i,
    /class="[^"]*next[^"]*"[^>]*href="([^"]+)"/i,
    /<a[^>]*rel="next"[^>]*href="([^"]+)"/i,
    /href="([^"]+)"[^>]*rel="next"/i,
  ];

  for (const pattern of nextPatterns) {
    const match = html.match(pattern);
    if (match) {
      let nextUrl = match[1];
      if (!nextUrl.startsWith('http')) {
        nextUrl = `${SCRAPER_CONFIG.baseUrl}${nextUrl}`;
      }
      log(`[Schedule] 🔗 Found pagination link: ${nextUrl}`);
      return {
        hasNextPage: true,
        nextPageUrl: nextUrl,
      };
    }
  }

  log(`[Schedule] 🔗 No pagination link found`);
  return {
    hasNextPage: false,
    nextPageUrl: null,
  };
}


/**
 * Delay utility
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  parseSchedulePage,
  filterBoardingAppointments,
  fetchSchedulePage,
  fetchAllSchedulePages,
};
