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
 * Extract CSRF token from HTML
 */
function extractCsrfToken(html) {
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
 * Combine cookies from Set-Cookie headers
 */
function combineCookies(...cookieStrings) {
  const cookies = new Map();

  for (const cookieString of cookieStrings) {
    if (!cookieString) continue;
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

        const initialCookies = loginPageResponse.headers.get('set-cookie') || '';
        const loginPageHtml = await loginPageResponse.text();
        const csrfToken = extractCsrfToken(loginPageHtml);

        // Prepare form data
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
          redirect: 'manual',
        });

        const isRedirect = loginResponse.status >= 300 && loginResponse.status < 400;
        const newCookies = loginResponse.headers.get('set-cookie') || '';
        const allCookies = combineCookies(initialCookies, newCookies);

        if (isRedirect || loginResponse.ok) {
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
