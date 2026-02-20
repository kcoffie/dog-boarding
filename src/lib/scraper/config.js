/**
 * Scraper configuration
 * @requirements REQ-100
 */

export const SCRAPER_CONFIG = {
  // Base URL for external site
  baseUrl: import.meta.env.VITE_EXTERNAL_SITE_URL || 'https://agirlandyourdog.com',

  // Rate limiting
  delayBetweenRequests: 1500, // 1.5 seconds between requests
  maxRequestsPerMinute: 30,

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
