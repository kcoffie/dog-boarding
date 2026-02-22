/**
 * Server-side proxy for external sync operations
 * Bypasses CORS restrictions by making requests from the server
 * @requirements REQ-100, REQ-104
 */

export const config = {
  runtime: 'edge',
};

const EXTERNAL_BASE_URL = 'https://agirlandyourdog.com';

/**
 * Sanitize error messages to avoid leaking sensitive information
 */
function sanitizeError(message) {
  if (!message) return 'Unknown error';
  let sanitized = message.replace(/https?:\/\/[^\s]+/g, '[URL]');
  sanitized = sanitized.replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');
  sanitized = sanitized.replace(/username[=:]\s*\S+/gi, 'username=[REDACTED]');
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '...';
  }
  return sanitized;
}

/**
 * Parse all input fields from a login form in HTML.
 * Returns a map of { fieldName: { type, value } }.
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
 * Uses indexOf('=') to handle cookie values containing '=' signs.
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

export default async function handler(request) {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { action, username, password, url, cookies, method = 'GET' } = body;

    // Handle different actions
    switch (action) {
      case 'authenticate': {
        if (!username || !password) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Username and password are required',
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const loginUrl = `${EXTERNAL_BASE_URL}/login`;

        // Get login page for CSRF token
        const loginPageResponse = await fetch(loginUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
          },
        });

        if (!loginPageResponse.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: `Failed to load login page: ${loginPageResponse.status}`,
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const initialCookiesArr = loginPageResponse.headers.getSetCookie?.() ?? [];
        const initialCookieHeader = cookiesArrayToHeader(initialCookiesArr);
        const loginPageHtml = await loginPageResponse.text();
        const formFields = extractLoginFormFields(loginPageHtml);

        // Build form data: use discovered field names + include all hidden fields
        const formData = new URLSearchParams();
        for (const [name, { type, value }] of Object.entries(formFields)) {
          if (type === 'hidden') {
            formData.append(name, value);
          } else if (type === 'text' || type === 'email') {
            formData.append(name, username);
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
          redirect: 'manual',
        });

        // Successful login returns 302 redirect to schedule/dashboard
        const isRedirect = loginResponse.status >= 300 && loginResponse.status < 400;
        const newCookiesArr = loginResponse.headers.getSetCookie?.() ?? [];
        const allCookies = cookiesArrayToHeader([...initialCookiesArr, ...newCookiesArr]);

        if (isRedirect) {
          return new Response(JSON.stringify({
            success: true,
            cookies: allCookies,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const responseText = await loginResponse.text();
        if (responseText.includes('invalid') || responseText.includes('incorrect')) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid credentials',
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          success: false,
          error: `Login failed with status ${loginResponse.status}`,
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'fetch': {
        if (!url) {
          return new Response(JSON.stringify({
            success: false,
            error: 'URL is required',
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Construct full URL if relative
        const fullUrl = url.startsWith('http') ? url : `${EXTERNAL_BASE_URL}${url}`;

        const response = await fetch(fullUrl, {
          method,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
            ...(cookies ? { 'Cookie': cookies } : {}),
          },
        });

        const html = await response.text();

        return new Response(JSON.stringify({
          success: response.ok,
          status: response.status,
          html,
          cookies: response.headers.get('set-cookie') || '',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('[sync-proxy] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeError(error.message),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
