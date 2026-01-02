/**
 * Authentication module for external site scraping
 * @requirements REQ-100
 */

import { SCRAPER_CONFIG } from './config.js';

/**
 * Session storage for authenticated requests
 */
let sessionCookies = null;
let sessionExpiry = null;

/**
 * Authenticate with the external booking system
 * @param {string} username - Login username/email
 * @param {string} password - Login password
 * @returns {Promise<{success: boolean, cookies?: string, error?: string}>}
 */
export async function authenticate(username, password) {
  if (!username || !password) {
    return {
      success: false,
      error: 'Username and password are required',
    };
  }

  try {
    const loginUrl = `${SCRAPER_CONFIG.baseUrl}/login`;

    // First, get the login page to obtain any CSRF tokens
    const loginPageResponse = await fetch(loginUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
      },
    });

    if (!loginPageResponse.ok) {
      return {
        success: false,
        error: `Failed to load login page: ${loginPageResponse.status}`,
      };
    }

    // Extract cookies from login page
    const initialCookies = loginPageResponse.headers.get('set-cookie') || '';

    // Parse login page for CSRF token if present
    const loginPageHtml = await loginPageResponse.text();
    const csrfToken = extractCsrfToken(loginPageHtml);

    // Prepare login form data
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    if (csrfToken) {
      formData.append('_token', csrfToken);
      formData.append('csrf_token', csrfToken);
    }

    // Submit login
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
        'Cookie': initialCookies,
      },
      body: formData.toString(),
      redirect: 'manual', // Don't follow redirects automatically
    });

    // Check for successful login (usually a redirect to dashboard/schedule)
    const isRedirect = loginResponse.status >= 300 && loginResponse.status < 400;
    const newCookies = loginResponse.headers.get('set-cookie') || '';

    // Combine cookies
    const allCookies = combineCookies(initialCookies, newCookies);

    if (isRedirect || loginResponse.ok) {
      // Store session
      sessionCookies = allCookies;
      sessionExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      return {
        success: true,
        cookies: allCookies,
      };
    }

    // Check response for error messages
    const responseText = await loginResponse.text();
    if (responseText.includes('invalid') || responseText.includes('incorrect')) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    return {
      success: false,
      error: `Login failed with status ${loginResponse.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Authentication error: ${error.message}`,
    };
  }
}

/**
 * Get current session cookies if valid
 * @returns {string|null}
 */
export function getSessionCookies() {
  if (sessionCookies && sessionExpiry && Date.now() < sessionExpiry) {
    return sessionCookies;
  }
  return null;
}

/**
 * Check if we have a valid session
 * @returns {boolean}
 */
export function isAuthenticated() {
  return getSessionCookies() !== null;
}

/**
 * Clear the current session
 */
export function clearSession() {
  sessionCookies = null;
  sessionExpiry = null;
}

/**
 * Set session from external source (e.g., stored cookies)
 * @param {string} cookies
 * @param {number} [expiryMs] - Expiry time in ms from now
 */
export function setSession(cookies, expiryMs = 24 * 60 * 60 * 1000) {
  sessionCookies = cookies;
  sessionExpiry = Date.now() + expiryMs;
}

/**
 * Make an authenticated request
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function authenticatedFetch(url, options = {}) {
  const cookies = getSessionCookies();

  if (!cookies) {
    throw new Error('Not authenticated. Call authenticate() first.');
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
    'Cookie': cookies,
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Extract CSRF token from HTML
 * @param {string} html
 * @returns {string|null}
 */
function extractCsrfToken(html) {
  // Try common CSRF token patterns
  const patterns = [
    /<input[^>]*name="_token"[^>]*value="([^"]+)"/i,
    /<input[^>]*name="csrf_token"[^>]*value="([^"]+)"/i,
    /<meta[^>]*name="csrf-token"[^>]*content="([^"]+)"/i,
    /csrfToken['"]\s*:\s*['"]([^'"]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Combine multiple Set-Cookie headers
 * @param {...string} cookieStrings
 * @returns {string}
 */
function combineCookies(...cookieStrings) {
  const cookies = new Map();

  for (const cookieString of cookieStrings) {
    if (!cookieString) continue;

    // Split multiple cookies
    const parts = cookieString.split(/,(?=[^;]+=[^;]+)/);

    for (const part of parts) {
      const [nameValue] = part.split(';');
      const [name, value] = nameValue.split('=');
      if (name && value) {
        cookies.set(name.trim(), value.trim());
      }
    }
  }

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export default {
  authenticate,
  getSessionCookies,
  isAuthenticated,
  clearSession,
  setSession,
  authenticatedFetch,
};
