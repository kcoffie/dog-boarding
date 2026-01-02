/**
 * Schedule page parsing module
 * @requirements REQ-101
 */

import { SCRAPER_CONFIG } from './config.js';
import { authenticatedFetch, isAuthenticated } from './auth.js';

/**
 * Parse appointment links from schedule page HTML
 * @param {string} html - Schedule page HTML
 * @returns {Array<{id: string, url: string, title: string}>}
 */
export function parseSchedulePage(html) {
  const appointments = [];

  // Match appointment links: /schedule/a/{id}/{timestamp}
  const linkPattern = /href="([^"]*\/schedule\/a\/([^/"]+)\/(\d+)[^"]*)"/gi;
  const titlePattern = /<a[^>]*href="[^"]*\/schedule\/a\/([^/"]+)\/\d+[^"]*"[^>]*>([^<]+)</gi;

  // Extract URLs and IDs
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const [, url, id] = match;
    appointments.push({
      id,
      url: url.startsWith('http') ? url : `${SCRAPER_CONFIG.baseUrl}${url}`,
      title: '', // Will be filled below
    });
  }

  // Extract titles
  while ((match = titlePattern.exec(html)) !== null) {
    const [, id, title] = match;
    const appt = appointments.find(a => a.id === id);
    if (appt) {
      appt.title = title.trim();
    }
  }

  return appointments;
}

/**
 * Filter appointments to only boarding-related ones
 * @param {Array<{id: string, url: string, title: string}>} appointments
 * @returns {Array<{id: string, url: string, title: string}>}
 */
export function filterBoardingAppointments(appointments) {
  const boardingKeywords = ['boarding', 'overnight', 'nights', 'stay'];

  return appointments.filter(appt => {
    const titleLower = appt.title.toLowerCase();
    return boardingKeywords.some(keyword => titleLower.includes(keyword));
  });
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

  const response = await authenticatedFetch(scheduleUrl, {
    timeout: SCRAPER_CONFIG.pageTimeout,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schedule: ${response.status}`);
  }

  const html = await response.text();

  // Check if we need to re-authenticate (redirected to login)
  if (html.includes('login') && html.includes('password')) {
    throw new Error('Session expired. Re-authentication required.');
  }

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

  while (pageCount < maxPages) {
    const result = currentUrl
      ? await fetchSchedulePageByUrl(currentUrl, fetchOptions.boardingOnly)
      : await fetchSchedulePage(fetchOptions);

    allAppointments.push(...result.appointments);
    pageCount++;

    if (!result.hasNextPage || !result.nextPageUrl) {
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
      return {
        hasNextPage: true,
        nextPageUrl: nextUrl,
      };
    }
  }

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
