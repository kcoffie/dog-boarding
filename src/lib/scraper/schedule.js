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

  // Build schedule URL with date parameters if provided
  let scheduleUrl = `${SCRAPER_CONFIG.baseUrl}/schedule`;
  const params = new URLSearchParams();

  if (startDate) {
    params.append('start', formatDateParam(startDate));
  }
  if (endDate) {
    params.append('end', formatDateParam(endDate));
  }

  const queryString = params.toString();
  if (queryString) {
    scheduleUrl += `?${queryString}`;
  }

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

    currentUrl = result.nextPageUrl;

    // Rate limiting delay between pages
    await delay(SCRAPER_CONFIG.delayBetweenRequests);
  }

  // Deduplicate by ID
  const uniqueAppointments = Array.from(
    new Map(allAppointments.map(a => [a.id, a])).values()
  );

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
 * Format date for URL parameter
 * @param {Date} date
 * @returns {string}
 */
function formatDateParam(date) {
  return date.toISOString().split('T')[0];
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
