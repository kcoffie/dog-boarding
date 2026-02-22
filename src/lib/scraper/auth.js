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
 * Check if running in browser environment (not test environment)
 */
function isBrowser() {
  return typeof window !== 'undefined' &&
    typeof import.meta !== 'undefined' &&
    import.meta.env?.MODE !== 'test';
}

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
    // Use server-side proxy in browser to bypass CORS
    if (isBrowser()) {
      const proxyStart = Date.now();
      console.log('[Auth] 🔐 Using server-side proxy for authentication...');

      const response = await fetch('/api/sync-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'authenticate', username, password }),
      });

      const result = await response.json();
      const proxyDuration = Date.now() - proxyStart;

      if (result.success) {
        sessionCookies = result.cookies;
        sessionExpiry = Date.now() + (24 * 60 * 60 * 1000);
        console.log(`[Auth] ✅ Authentication successful via proxy (${proxyDuration}ms)`);
      } else {
        console.log(`[Auth] ❌ Authentication failed via proxy (${proxyDuration}ms): ${result.error}`);
      }

      return result;
    }

    // Direct fetch for server-side (Node.js) execution
    const loginUrl = `${SCRAPER_CONFIG.baseUrl}/login`;

    // Get login page to discover form fields (field names + hidden values like nonce)
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

    // Use getSetCookie() (Node.js 18.14+) for proper multi-cookie handling
    const initialCookiesArr = loginPageResponse.headers.getSetCookie?.() ?? [];
    const initialCookieHeader = cookiesArrayToHeader(initialCookiesArr);

    // Parse login page to extract all form fields
    const loginPageHtml = await loginPageResponse.text();
    const formFields = extractLoginFormFields(loginPageHtml);

    // Build form data: use discovered field names + include all hidden fields
    const formData = new URLSearchParams();
    for (const [name, { type, value }] of Object.entries(formFields)) {
      if (type === 'hidden') {
        formData.append(name, value);
      } else if (type === 'text' || type === 'email') {
        formData.append(name, username); // first text/email field = username/email
      } else if (type === 'password') {
        formData.append(name, password);
      }
    }

    // Submit login
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
        'Cookie': initialCookieHeader,
      },
      body: formData.toString(),
      redirect: 'manual', // Don't follow redirects automatically
    });

    // Successful login returns 302 redirect to schedule/dashboard
    const isRedirect = loginResponse.status >= 300 && loginResponse.status < 400;
    const newCookiesArr = loginResponse.headers.getSetCookie?.() ?? [];
    const allCookies = cookiesArrayToHeader([...initialCookiesArr, ...newCookiesArr]);

    if (isRedirect) {
      // Store session
      sessionCookies = allCookies;
      sessionExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      return {
        success: true,
        cookies: allCookies,
      };
    }

    // 200 means login form returned (failed login)
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

  // Use server-side proxy in browser to bypass CORS
  if (isBrowser()) {
    const proxyStart = Date.now();
    console.log('[Auth] 📡 Fetching via proxy:', url);

    const response = await fetch('/api/sync-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'fetch',
        url,
        cookies,
        method: options.method || 'GET',
      }),
    });

    const result = await response.json();
    const proxyDuration = Date.now() - proxyStart;

    console.log(`[Auth] ⏱️ Proxy fetch completed (${proxyDuration}ms): ${result.success ? 'success' : 'failed'}`);

    // Return a Response-like object that matches the expected interface
    return {
      ok: result.success,
      status: result.status || (result.success ? 200 : 500),
      text: async () => result.html || '',
      json: async () => JSON.parse(result.html || '{}'),
      headers: {
        get: (name) => name.toLowerCase() === 'set-cookie' ? result.cookies : null,
      },
    };
  }

  // Direct fetch for server-side (Node.js) execution
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
 * Parse all input fields from a login form in HTML.
 * Returns a map of { fieldName: { type, value } }.
 * Used to discover actual field names (e.g. "email"/"passwd") and
 * include hidden fields like nonce/CSRF tokens automatically.
 * @param {string} html
 * @returns {Object}
 */
function extractLoginFormFields(html) {
  const fields = {};
  for (const [input] of html.matchAll(/<input[^>]*>/gi)) {
    const type = (input.match(/type="([^"]+)"/i)?.[1] || 'text').toLowerCase();
    const name = input.match(/name="([^"]+)"/i)?.[1];
    const value = input.match(/value="([^"]+)"/i)?.[1] ?? '';
    if (name) fields[name] = { type, value };
  }
  return fields;
}

/**
 * Build a Cookie request header from an array of Set-Cookie strings.
 * Uses indexOf('=') to correctly handle cookie values containing '=' signs.
 * Strips surrounding quotes from cookie values.
 * @param {string[]} setCookieArr
 * @returns {string}
 */
function cookiesArrayToHeader(setCookieArr) {
  const cookies = new Map();
  for (const setCookie of setCookieArr) {
    const [nameValue] = setCookie.split(';');
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx < 0) continue;
    const name = nameValue.slice(0, eqIdx).trim();
    const value = nameValue.slice(eqIdx + 1).trim().replace(/^"|"$/g, '');
    if (name) cookies.set(name, value);
  }
  return Array.from(cookies.entries()).map(([n, v]) => `${n}=${v}`).join('; ');
}

export default {
  authenticate,
  getSessionCookies,
  isAuthenticated,
  clearSession,
  setSession,
  authenticatedFetch,
};
