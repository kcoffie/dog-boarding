/**
 * Scraper configuration
 * @requirements REQ-100
 */

export const SCRAPER_CONFIG = {
  // Base URL for external site
  baseUrl: import.meta.env?.VITE_EXTERNAL_SITE_URL ?? (typeof process !== 'undefined' ? process.env.VITE_EXTERNAL_SITE_URL : undefined) ?? 'https://agirlandyourdog.com',

  // Rate limiting
  delayBetweenRequests: 1500, // 1.5 seconds between requests
  maxRequestsPerMinute: 30,

  // Day-service name patterns used to classify pricing line items (REQ-200).
  // A line item whose service name matches ANY of these is treated as a day-boarding
  // or daycare charge, not a night-boarding charge.
  // Note: applied to the service name WITHIN #confirm-price, not to appointment titles.
  dayServicePatterns: [/day/i, /daycare/i, /DC /i, /pack/i],

  // Parse degradation detection (REQ-110)
  // If more than this fraction of detail fetches have a null pet_name OR null
  // check_in_datetime, the sync log is written with status 'parse_degraded'.
  // Tweak this value if the external site legitimately has sparse fields.
  parseNullThreshold: 0.20, // 20%

  // Timeouts
  authTimeout: 30000, // 30 seconds for auth
  pageTimeout: 15000, // 15 seconds per page
  syncTimeout: 600000, // 10 minutes max for full sync

  // Retry settings
  maxRetries: 3,
  retryDelays: [5000, 30000, 300000], // 5s, 30s, 5min

  // Selectors for parsing (can be overridden if site structure changes)
  selectors: {
    // Login page
    loginForm: 'form[action*="login"]',
    usernameField: 'input[name="username"], input[name="email"], input[type="email"]',
    passwordField: 'input[name="password"], input[type="password"]',

    // Schedule page
    appointmentLinks: 'a[href*="/schedule/a/"]',
    paginationNext: '.pagination .next, a[rel="next"]',

    // Appointment detail page — selectors verified against real HTML 2026-02-19
    // Only these fields use extractText()/selectorToRegex(); everything else
    // is extracted by dedicated helpers in extraction.js.
    serviceType: 'h1',
    status: '.appt-change-status',

    // Client info
    clientName: '.event-client',

    // Pet info
    petName: '.event-pet',
  },
};

export default SCRAPER_CONFIG;
