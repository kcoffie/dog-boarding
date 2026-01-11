import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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

              // Extract CSRF token
              const csrfPatterns = [
                /<input[^>]*name="_token"[^>]*value="([^"]+)"/i,
                /<input[^>]*name="csrf_token"[^>]*value="([^"]+)"/i,
              ];
              let csrfToken = null;
              for (const pattern of csrfPatterns) {
                const match = loginPageHtml.match(pattern);
                if (match) { csrfToken = match[1]; break; }
              }

              const formData = new URLSearchParams();
              formData.append('username', username);
              formData.append('password', password);
              if (csrfToken) {
                formData.append('_token', csrfToken);
                formData.append('csrf_token', csrfToken);
              }

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

              // Combine cookies
              const cookieMap = new Map();
              [initialCookies, newCookies].forEach(cs => {
                if (!cs) return;
                cs.split(/,(?=[^;]+=[^;]+)/).forEach(part => {
                  const [nameValue] = part.split(';');
                  const [name, value] = nameValue.split('=');
                  if (name && value) cookieMap.set(name.trim(), value.trim());
                });
              });
              const allCookies = Array.from(cookieMap.entries()).map(([n, v]) => `${n}=${v}`).join('; ');

              res.setHeader('Content-Type', 'application/json');
              if (isRedirect || loginResponse.ok) {
                res.end(JSON.stringify({ success: true, cookies: allCookies }));
              } else {
                res.end(JSON.stringify({ success: false, error: `Login failed with status ${loginResponse.status}` }));
              }
            } else if (action === 'fetch') {
              const fullUrl = url.startsWith('http') ? url : `${EXTERNAL_BASE_URL}${url}`;
              const response = await fetch(fullUrl, {
                method,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
                  ...(cookies ? { 'Cookie': cookies } : {}),
                },
              });
              const html = await response.text();
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
