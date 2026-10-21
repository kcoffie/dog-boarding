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
 * The booking site answered 429 (too many requests) or 403 (refused). The run stops at once:
 * no retries, and no further request to the site in this run (#324).
 */
export class SiteThrottled extends Error {
  constructor(status) {
    super(`Booking site answered ${status}: stopping this run`);
    this.name = 'SiteThrottled';
    this.status = status;
  }
}

/** sync-proxy refused: the breaker is tripped. Stops a run exactly as a 429/403 does. */
export class SiteBlocked extends SiteThrottled {
  constructor() {
    super(423);
    this.name = 'SiteBlocked';
    this.message = 'Booking site access is blocked until Clear in Settings: stopping this run';
  }
}

// Set by the first 429/403 in a run; every later request throws it without touching the site,
// so loops that catch errors and carry on can't keep going. Reset by setSession/resetSiteStop.
let siteStop = null;

/** Start a new run: forget an earlier run's 429/403 stop. */
export function resetSiteStop() {
  siteStop = null;
}

// One paced queue for every booking-site request in this process (#324): each request starts
// at least delayBetweenRequests after the previous one. A promise chain, not read-then-sleep,
// so two calls in the same process can't both slip through.
let paceChain = Promise.resolve();
let lastRequestAt = 0;

function paced(fn) {
  const turn = paceChain.then(async () => {
    const wait = lastRequestAt + SCRAPER_CONFIG.delayBetweenRequests - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  });
  paceChain = turn;
  return turn.then(fn);
}

const isThrottle = (status) => status === 429 || status === 403;

/** True when a redirect Location points at the booking site's login page. */
function isLoginPath(location) {
  try {
    return /^\/login\/?$/.test(new URL(location, SCRAPER_CONFIG.baseUrl).pathname);
  } catch {
    return false;
  }
}

// The Supabase client of a Node run, given by setSession: a 429/403 trips the breaker there.
let breakerDb = null;

async function stopIfThrottled(status, url) {
  if (!isThrottle(status)) return;
  siteStop = new SiteThrottled(status);
  if (breakerDb) {
    // Loaded here, not at the top: the browser bundle never needs it (sync-proxy trips instead)
    const { tripBreaker, throttleReason } = await import('./siteAccess.js');
    await tripBreaker(breakerDb, throttleReason(status, url));
  }
  throw siteStop;
}

/**
 * Build headers for sync-proxy calls: the signed-in user's Supabase access token (REQ-656).
 * Browser only. supabase.js is imported here, not at the top, because cron-auth and the other
 * server jobs import this file and supabase.js throws at load without import.meta.env.
 * getSession() runs on every call so a long Sync Now gets a refreshed token.
 */
async function proxyHeaders() {
  const { supabase } = await import('../supabase.js');
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

/**
 * Check if running in browser environment (not test environment)
 */
function isBrowser() {
  return typeof window !== 'undefined' &&
    typeof import.meta !== 'undefined' &&
    import.meta.env?.MODE !== 'test';
}

/**
 * Log in to the booking site (Node only: cron-auth and Clear, through siteLogin.js). The browser
 * never logs in; sync-proxy adds the stored session on the server (#324).
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, cookies?: string, error?: string,
 *   throttled?: boolean, status?: number, rejected?: boolean}>} `throttled` (with its `status`): a 429/403 on the login page or the
 *   login itself; `rejected`: the site answered the login without letting us in. Both are lockout
 *   risks and trip the breaker. A 5xx or a network error is neither.
 */
export async function authenticate(username, password) {
  try {
    // Direct fetch for server-side (Node.js) execution - credentials required
    if (!username || !password) {
      return {
        success: false,
        error: 'Username and password are required',
      };
    }

    const loginUrl = `${SCRAPER_CONFIG.baseUrl}/login`;

    // Get login page to discover form fields (field names + hidden values like nonce)
    const loginPageResponse = await paced(() => fetch(loginUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
      },
    }));

    if (!loginPageResponse.ok) {
      return {
        success: false,
        error: `Failed to load login page: ${loginPageResponse.status}`,
        ...(isThrottle(loginPageResponse.status) ? { throttled: true, status: loginPageResponse.status } : {}),
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
    const loginResponse = await paced(() => fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
        'Cookie': initialCookieHeader,
      },
      body: formData.toString(),
      redirect: 'manual', // Don't follow redirects automatically
    }));

    // Successful login returns 302 redirect to schedule/dashboard
    const isRedirect = loginResponse.status >= 300 && loginResponse.status < 400;
    const newCookiesArr = loginResponse.headers.getSetCookie?.() ?? [];
    const allCookies = cookiesArrayToHeader([...initialCookiesArr, ...newCookiesArr]);

    // A wrong password can also answer with a redirect back to the login page
    const location = loginResponse.headers.get?.('location') ?? '';
    if (isRedirect && isLoginPath(location)) {
      return { success: false, error: 'Login redirected back to the login page', rejected: true };
    }

    if (isRedirect) {
      // Store session
      sessionCookies = allCookies;
      sessionExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      return {
        success: true,
        cookies: allCookies,
      };
    }

    if (isThrottle(loginResponse.status)) {
      return { success: false, error: `Login answered ${loginResponse.status}`, throttled: true, status: loginResponse.status };
    }

    // 200 means login form returned (failed login)
    const responseText = await loginResponse.text();
    if (responseText.includes('invalid') || responseText.includes('incorrect')) {
      return {
        success: false,
        error: 'Invalid credentials',
        rejected: true,
      };
    }

    return {
      success: false,
      error: `Login failed with status ${loginResponse.status}`,
      // A 5xx is the site failing, not a refusal
      ...(loginResponse.status < 500 ? { rejected: true } : {}),
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
 * Clear the current session
 */
export function clearSession() {
  sessionCookies = null;
  sessionExpiry = null;
  breakerDb = null;
}

/**
 * Start a Node run with the stored session (from getSiteSession). Forgets an earlier run's stop.
 * @param {string} cookies
 * @param {{ expiryMs?: number, supabase?: import('@supabase/supabase-js').SupabaseClient }} [opts]
 *   `supabase`: where a 429/403 in this run trips the breaker (#324)
 */
export function setSession(cookies, { expiryMs = 24 * 60 * 60 * 1000, supabase = null } = {}) {
  sessionCookies = cookies;
  sessionExpiry = Date.now() + expiryMs;
  breakerDb = supabase;
  resetSiteStop();
}

/**
 * Make an authenticated request. Every booking-site request goes through here: paced, and a
 * 429/403 throws SiteThrottled and stops the rest of the run (#324).
 * @param {string} url
 * @param {RequestInit} [options] - `redirect: 'manual'` returns a redirect instead of following it
 * @returns {Promise<Response>}
 */
export async function authenticatedFetch(url, options = {}) {
  if (siteStop) throw siteStop;

  // Browser (Sync Now): sync-proxy adds the stored session on the server, checks the breaker,
  // and trips it on a 429/403. The browser never holds the session.
  if (isBrowser()) {
    const proxyStart = Date.now();
    console.log('[Auth] 📡 Fetching via proxy:', url);

    const headers = await proxyHeaders();
    const response = await paced(() => fetch('/api/sync-proxy', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'fetch',
        url,
        method: options.method || 'GET',
      }),
    }));

    const result = await response.json();
    const proxyDuration = Date.now() - proxyStart;

    console.log(`[Auth] ⏱️ Proxy fetch completed (${proxyDuration}ms): ${result.success ? 'success' : 'failed'}`);
    if (result.blocked) {
      siteStop = new SiteBlocked();
      throw siteStop;
    }
    if (result.noSession) throw new Error(result.error || 'No booking-site session');
    await stopIfThrottled(result.status, url);
    // sync-proxy follows no redirects. Unless the caller asked to see them (reconciliation), a
    // redirect to the login page is an expired session and any other is an error naming it.
    if (options.redirect !== 'manual' && result.status >= 300 && result.status < 400) {
      if (isLoginPath(result.location || '')) throw new Error('Session expired. Re-authentication required.');
      throw new Error(`Booking site redirected (${result.status}) to ${result.location || 'nowhere'}`);
    }

    // Return a Response-like object that matches the expected interface
    return {
      ok: result.success,
      status: result.status || (result.success ? 200 : 500),
      text: async () => result.html || '',
      json: async () => JSON.parse(result.html || '{}'),
      headers: {
        get: (name) => (name.toLowerCase() === 'location' ? result.location || null : null),
      },
    };
  }

  const cookies = getSessionCookies();

  if (!cookies) {
    throw new Error('Not authenticated. Call authenticate() first.');
  }

  // Direct fetch for server-side (Node.js) execution
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
    'Cookie': cookies,
    ...options.headers,
  };

  const response = await paced(() => fetch(url, {
    ...options,
    headers,
  }));
  await stopIfThrottled(response.status, url);
  return response;
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
  clearSession,
  setSession,
  authenticatedFetch,
  resetSiteStop,
};
