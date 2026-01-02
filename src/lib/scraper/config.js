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

    // Appointment detail page
    serviceType: 'h1, .service-type, .appointment-type',
    status: '.status, .appointment-status',
    checkIn: '.check-in, .checkin-date, [data-field="checkin"]',
    checkOut: '.check-out, .checkout-date, [data-field="checkout"]',
    duration: '.duration, .nights',
    assignedStaff: '.staff, .assigned-to',

    // Client info
    clientName: '.client-name, .owner-name',
    clientEmail: '.client-email, .email',
    clientPhone: '.client-phone, .phone',
    clientAddress: '.client-address, .address',

    // Pet info
    petName: '.pet-name, .dog-name',
    petBreed: '.pet-breed, .breed',
    petBirthdate: '.pet-birthdate, .birthdate',
    petNotes: '.pet-notes, .special-notes',
    petMedical: '.pet-medical, .medical-info',
    petBehavioral: '.pet-behavioral, .behavioral-info',
  },
};

export default SCRAPER_CONFIG;
