/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

// File logging plugin - writes sync logs to disk for debugging
function fileLoggingPlugin() {
  const logDir = path.resolve(process.cwd(), 'logs');
  const logFile = path.join(logDir, 'sync.log');

  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  return {
    name: 'file-logging',
    configureServer(server) {
      // POST /api/log - append log entry to file
      server.middlewares.use('/api/log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const logEntry = JSON.parse(body);
            const timestamp = logEntry.timestamp || new Date().toISOString();
            const level = (logEntry.level || 'INFO').toUpperCase().padEnd(5);
            const message = logEntry.message || '';
            const context = logEntry.context ? ` ${JSON.stringify(logEntry.context)}` : '';

            const logLine = `${timestamp} [${level}] ${message}${context}\n`;

            // Append to log file
            fs.appendFileSync(logFile, logLine);

            // Also print to server console for immediate visibility
            console.log(`[FileLog] ${logLine.trim()}`);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (error) {
            console.error('[FileLog] Error writing log:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
        });
      });

      // GET /api/log - read recent log entries (for debugging)
      server.middlewares.use('/api/log/tail', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          if (!fs.existsSync(logFile)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ lines: [], message: 'No log file yet' }));
            return;
          }

          const content = fs.readFileSync(logFile, 'utf-8');
          const lines = content.trim().split('\n').slice(-100); // Last 100 lines

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ lines }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      // DELETE /api/log - clear log file
      server.middlewares.use('/api/log/clear', (req, res) => {
        if (req.method !== 'DELETE' && req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          fs.writeFileSync(logFile, '');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, message: 'Log cleared' }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
}

// Local API proxy plugin for development
function localApiProxy() {
  return {
    name: 'local-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sync-proxy', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const { action, username, password, url, cookies, method = 'GET' } = JSON.parse(body);
            const EXTERNAL_BASE_URL = 'https://agirlandyourdog.com';

            if (action === 'authenticate') {
              // Authentication logic
              const loginUrl = `${EXTERNAL_BASE_URL}/login`;
              const loginPageResponse = await fetch(loginUrl, {
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)' },
              });

              if (!loginPageResponse.ok) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: `Failed to load login page: ${loginPageResponse.status}` }));
                return;
              }

              const initialCookies = loginPageResponse.headers.get('set-cookie') || '';
              const loginPageHtml = await loginPageResponse.text();

              console.log(`[API Proxy] AUTH - Login page HTML length: ${loginPageHtml.length}`);
              console.log(`[API Proxy] AUTH - Initial cookies: ${initialCookies.substring(0, 100) || 'NONE'}`);

              // Extract CSRF token - try more patterns
              const csrfPatterns = [
                /<input[^>]*name="nonce"[^>]*value="([^"]+)"/i,
                /<input[^>]*value="([^"]+)"[^>]*name="nonce"/i,
                /<input[^>]*name="_token"[^>]*value="([^"]+)"/i,
                /<input[^>]*name="csrf_token"[^>]*value="([^"]+)"/i,
                /<input[^>]*value="([^"]+)"[^>]*name="_token"/i,
                /<meta[^>]*name="csrf-token"[^>]*content="([^"]+)"/i,
              ];
              let csrfToken = null;
              for (const pattern of csrfPatterns) {
                const match = loginPageHtml.match(pattern);
                if (match) {
                  csrfToken = match[1];
                  console.log(`[API Proxy] AUTH - Found CSRF with pattern: ${pattern}`);
                  break;
                }
              }

              // Log form fields found in login page
              const formFieldMatches = loginPageHtml.match(/<input[^>]*name="([^"]+)"/gi) || [];
              console.log(`[API Proxy] AUTH - Form fields found: ${formFieldMatches.slice(0, 5).join(', ')}`);

              if (!csrfToken) {
                console.log(`[API Proxy] AUTH - No CSRF token found, checking HTML snippet...`);
                const formSection = loginPageHtml.match(/<form[^>]*>[\s\S]*?<\/form>/i);
                if (formSection) {
                  console.log(`[API Proxy] AUTH - Form HTML: ${formSection[0].substring(0, 500)}`);
                }
              }

              const formData = new URLSearchParams();
              formData.append('email', username);
              formData.append('passwd', password);
              if (csrfToken) {
                formData.append('nonce', csrfToken);
              }

              console.log(`[API Proxy] AUTH - Posting to ${loginUrl} with CSRF: ${csrfToken ? 'yes' : 'no'}, form: username=${username ? 'set' : 'missing'}`);

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
              let newCookies = loginResponse.headers.get('set-cookie') || '';
              const loginResponseHtml = await loginResponse.text();

              console.log(`[API Proxy] AUTH - Login response status: ${loginResponse.status}, isRedirect: ${isRedirect}`);
              console.log(`[API Proxy] AUTH - Cookies from login POST: ${newCookies.substring(0, 100) || 'NONE'}`);
              console.log(`[API Proxy] AUTH - Login response HTML length: ${loginResponseHtml.length}`);
              console.log(`[API Proxy] AUTH - Login response preview: ${loginResponseHtml.substring(0, 300).replace(/\n/g, ' ')}`);

              // Check for login errors in response
              if (loginResponseHtml.includes('incorrect') || loginResponseHtml.includes('invalid') || loginResponseHtml.includes('error')) {
                console.log(`[API Proxy] AUTH - Possible login error in response`);
              }
              if (loginResponseHtml.includes('dashboard') || loginResponseHtml.includes('schedule') || loginResponseHtml.includes('Welcome')) {
                console.log(`[API Proxy] AUTH - Login appears successful (found dashboard/schedule/Welcome)`);
              }

              // If redirected, follow the redirect to get the session cookie
              if (isRedirect) {
                const redirectUrl = loginResponse.headers.get('location');
                console.log(`[API Proxy] AUTH - Following redirect to: ${redirectUrl}`);

                if (redirectUrl) {
                  const fullRedirectUrl = redirectUrl.startsWith('http') ? redirectUrl : `${EXTERNAL_BASE_URL}${redirectUrl}`;

                  // Combine cookies so far for the redirect request - use indexOf to preserve = chars
                  const tempCookieMap = new Map();
                  [initialCookies, newCookies].forEach(cs => {
                    if (!cs) return;
                    cs.split(/,(?=[^;]+=[^;]+)/).forEach(part => {
                      const [nameValue] = part.split(';');
                      const eqIndex = nameValue.indexOf('=');
                      if (eqIndex > 0) {
                        const name = nameValue.substring(0, eqIndex).trim();
                        const value = nameValue.substring(eqIndex + 1).trim();
                        if (name && value) tempCookieMap.set(name, value);
                      }
                    });
                  });
                  const cookiesForRedirect = Array.from(tempCookieMap.entries()).map(([n, v]) => `${n}=${v}`).join('; ');

                  const redirectResponse = await fetch(fullRedirectUrl, {
                    method: 'GET',
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
                      'Cookie': cookiesForRedirect,
                    },
                    redirect: 'manual',
                  });

                  const redirectCookies = redirectResponse.headers.get('set-cookie') || '';
                  console.log(`[API Proxy] AUTH - Cookies from redirect: ${redirectCookies.substring(0, 100) || 'NONE'}`);

                  // Add redirect cookies to the mix
                  newCookies = newCookies + (newCookies && redirectCookies ? ', ' : '') + redirectCookies;
                }
              }

              // Combine cookies - use indexOf to preserve = chars in cookie values
              const cookieMap = new Map();
              [initialCookies, newCookies].forEach(cs => {
                if (!cs) return;
                cs.split(/,(?=[^;]+=[^;]+)/).forEach(part => {
                  const [nameValue] = part.split(';');
                  const eqIndex = nameValue.indexOf('=');
                  if (eqIndex > 0) {
                    const name = nameValue.substring(0, eqIndex).trim();
                    const value = nameValue.substring(eqIndex + 1).trim();
                    if (name && value) {
                      cookieMap.set(name, value);
                      console.log(`[API Proxy] AUTH - Parsed cookie: ${name}=${value.substring(0, 30)}...`);
                    }
                  }
                });
              });
              const allCookies = Array.from(cookieMap.entries()).map(([n, v]) => `${n}=${v}`).join('; ');

              res.setHeader('Content-Type', 'application/json');
              if (isRedirect || loginResponse.ok) {
                console.log(`[API Proxy] AUTH SUCCESS - Cookies returned: ${allCookies.substring(0, 150)}...`);
                res.end(JSON.stringify({ success: true, cookies: allCookies }));
              } else {
                res.end(JSON.stringify({ success: false, error: `Login failed with status ${loginResponse.status}` }));
              }
            } else if (action === 'fetch') {
              const fullUrl = url.startsWith('http') ? url : `${EXTERNAL_BASE_URL}${url}`;
              console.log(`[API Proxy] FETCH: ${fullUrl}`);
              console.log(`[API Proxy] Cookies being sent: ${cookies ? cookies.substring(0, 100) + '...' : 'NONE'}`);
              const response = await fetch(fullUrl, {
                method,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
                  ...(cookies ? { 'Cookie': cookies } : {}),
                },
              });
              const html = await response.text();
              console.log(`[API Proxy] Response status: ${response.status}, HTML length: ${html.length}`);
              console.log(`[API Proxy] HTML preview: ${html.substring(0, 200).replace(/\n/g, ' ')}`);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: response.ok,
                status: response.status,
                html,
                cookies: response.headers.get('set-cookie') || '',
              }));
            } else {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: `Unknown action: ${action}` }));
            }
          } catch (error) {
            console.error('[API Proxy] Error:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    fileLoggingPlugin(),
    localApiProxy(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Qboard',
        short_name: 'Qboard',
        description: 'Manage your dog boarding business',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-152x152.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        categories: ['business', 'productivity']
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
  },
})
