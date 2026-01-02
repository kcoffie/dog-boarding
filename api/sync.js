/**
 * Sync API endpoint - Server-side proxy for external site scraping
 * @requirements REQ-108
 *
 * This runs server-side to bypass CORS restrictions when fetching
 * from the external booking system.
 */

import { createClient } from '@supabase/supabase-js';

// Config
const SCRAPER_CONFIG = {
  baseUrl: process.env.VITE_EXTERNAL_SITE_URL || 'https://agirlandyourdog.com',
  delayBetweenRequests: 1500,
  maxRetries: 3,
  retryDelays: [5000, 30000, 300000],
  pageTimeout: 15000,
};

// Sync status enum
const SyncStatus = {
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
};

/**
 * Sanitize error messages
 */
function sanitizeError(message) {
  if (!message) return 'Unknown error';
  let sanitized = message.replace(/https?:\/\/[^\s]+/g, '[URL]');
  sanitized = sanitized.replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');
  sanitized = sanitized.replace(/username[=:]\s*\S+/gi, 'username=[REDACTED]');
  sanitized = sanitized.replace(/email[=:]\s*\S+/gi, 'email=[REDACTED]');
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
    if (match) return match[1];
  }
  return null;
}

/**
 * Combine cookies
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

/**
 * Authenticate with external site
 */
async function authenticate(username, password) {
  if (!username || !password) {
    return { success: false, error: 'Username and password are required' };
  }

  try {
    const loginUrl = `${SCRAPER_CONFIG.baseUrl}/login`;

    // Get login page
    const loginPageResponse = await fetch(loginUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
      },
    });

    if (!loginPageResponse.ok) {
      return { success: false, error: `Failed to load login page: ${loginPageResponse.status}` };
    }

    const initialCookies = loginPageResponse.headers.get('set-cookie') || '';
    const loginPageHtml = await loginPageResponse.text();
    const csrfToken = extractCsrfToken(loginPageHtml);

    // Submit login
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
    const allCookies = combineCookies(initialCookies, newCookies);

    if (isRedirect || loginResponse.ok) {
      return { success: true, cookies: allCookies };
    }

    const responseText = await loginResponse.text();
    if (responseText.includes('invalid') || responseText.includes('incorrect')) {
      return { success: false, error: 'Invalid credentials' };
    }

    return { success: false, error: `Login failed with status ${loginResponse.status}` };
  } catch (error) {
    return { success: false, error: `Authentication error: ${error.message}` };
  }
}

/**
 * Make authenticated fetch
 */
async function authenticatedFetch(url, cookies, options = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
    'Cookie': cookies,
    ...options.headers,
  };

  return fetch(url, { ...options, headers });
}

/**
 * Parse schedule page for appointments
 */
function parseSchedulePage(html) {
  const appointments = [];
  const pattern = /href="([^"]*\/schedule\/a\/([^/]+)\/(\d+)[^"]*)"/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const [, url, id, timestamp] = match;
    const titleMatch = html.substring(match.index, match.index + 500).match(/>([^<]*(?:Boarding|Overnight|Night)[^<]*)</i);

    appointments.push({
      id,
      url: url.startsWith('http') ? url : `${SCRAPER_CONFIG.baseUrl}${url}`,
      title: titleMatch ? titleMatch[1].trim() : '',
      timestamp,
    });
  }

  // Deduplicate by ID
  const seen = new Set();
  return appointments.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

/**
 * Filter boarding appointments
 */
function filterBoardingAppointments(appointments) {
  const boardingKeywords = ['boarding', 'overnight', 'night'];
  return appointments.filter(a => {
    const title = (a.title || '').toLowerCase();
    return boardingKeywords.some(kw => title.includes(kw));
  });
}

/**
 * Clean extracted text
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract text using regex
 */
function extractText(html, pattern) {
  if (!pattern) return null;
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : null;
}

/**
 * Parse appointment detail page
 */
function parseAppointmentPage(html, sourceUrl = '') {
  // Extract email
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = html.match(emailPattern);

  // Extract phone
  const phonePattern = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const phoneMatch = html.match(phonePattern);

  // Parse dates
  const parseDateTime = (dateStr) => {
    if (!dateStr) return null;
    try {
      const isPM = /pm/i.test(dateStr);
      const isAM = /am/i.test(dateStr);
      const months = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      };
      const monthMatch = dateStr.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)/i);
      const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
      const yearMatch = dateStr.match(/\b(20\d{2})\b/);

      if (monthMatch && dayMatch && yearMatch) {
        const month = months[monthMatch[0].toLowerCase()];
        const day = parseInt(dayMatch[1], 10);
        const year = parseInt(yearMatch[1], 10);
        const hour = isPM ? 17 : (isAM ? 10 : 12);
        const date = new Date(Date.UTC(year, month, day, hour, 0, 0));
        return date.toISOString();
      }
    } catch {}
    return null;
  };

  // Extract check-in/check-out from common patterns
  const checkInMatch = html.match(/check[- ]?in[:\s]*([^<]+)/i);
  const checkOutMatch = html.match(/check[- ]?out[:\s]*([^<]+)/i);

  return {
    source_url: sourceUrl,
    service_type: extractText(html, /<h1[^>]*>([^<]+)/i) || extractText(html, /class="[^"]*service[^"]*"[^>]*>([^<]+)/i),
    status: extractText(html, /class="[^"]*status[^"]*"[^>]*>([^<]+)/i),
    scheduled_check_in: checkInMatch ? cleanText(checkInMatch[1]) : null,
    scheduled_check_out: checkOutMatch ? cleanText(checkOutMatch[1]) : null,
    check_in_datetime: parseDateTime(checkInMatch ? checkInMatch[1] : null),
    check_out_datetime: parseDateTime(checkOutMatch ? checkOutMatch[1] : null),
    client_name: extractText(html, /class="[^"]*(?:client|owner)[^"]*name[^"]*"[^>]*>([^<]+)/i),
    client_email_primary: emailMatch ? emailMatch[0] : null,
    client_phone: phoneMatch ? phoneMatch[0] : null,
    pet_name: extractText(html, /class="[^"]*(?:pet|dog)[^"]*name[^"]*"[^>]*>([^<]+)/i),
    pet_breed: extractText(html, /class="[^"]*breed[^"]*"[^>]*>([^<]+)/i),
  };
}

/**
 * Fetch appointment details
 */
async function fetchAppointmentDetails(appointmentId, timestamp, cookies) {
  const url = timestamp
    ? `${SCRAPER_CONFIG.baseUrl}/schedule/a/${appointmentId}/${timestamp}`
    : `${SCRAPER_CONFIG.baseUrl}/schedule/a/${appointmentId}`;

  const response = await authenticatedFetch(url, cookies);

  if (!response.ok) {
    throw new Error(`Failed to fetch appointment ${appointmentId}: ${response.status}`);
  }

  const html = await response.text();

  if (html.includes('login') && html.includes('password')) {
    throw new Error('Session expired. Re-authentication required.');
  }

  const data = parseAppointmentPage(html, url);
  data.external_id = appointmentId;

  return data;
}

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Map external data to dog record
 */
function mapToDog(external) {
  return {
    name: external.pet_name || 'Unknown',
    breed: external.pet_breed || null,
    source: 'external',
    external_id: external.external_id,
    active: true,
    day_rate: 0,
    night_rate: 0,
    owner_name: external.client_name || null,
    owner_email: external.client_email_primary || null,
    owner_phone: external.client_phone || null,
  };
}

/**
 * Map external data to boarding record
 */
function mapToBoarding(external, dogId) {
  return {
    dog_id: dogId,
    arrival_datetime: external.check_in_datetime,
    departure_datetime: external.check_out_datetime,
    source: 'external',
    external_id: external.external_id,
    status: 'scheduled',
  };
}

/**
 * Main sync handler
 */
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate environment
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  const externalUsername = process.env.VITE_EXTERNAL_SITE_USERNAME;
  const externalPassword = process.env.VITE_EXTERNAL_SITE_PASSWORD;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase configuration missing' });
  }

  if (!externalUsername || !externalPassword) {
    return res.status(400).json({ error: 'External site credentials not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  const result = {
    success: false,
    status: SyncStatus.FAILED,
    appointmentsFound: 0,
    appointmentsCreated: 0,
    appointmentsUpdated: 0,
    appointmentsFailed: 0,
    errors: [],
    durationMs: 0,
  };

  let syncLog = null;

  try {
    // Create sync log
    const { data: logData, error: logError } = await supabase
      .from('sync_logs')
      .insert({
        status: SyncStatus.RUNNING,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) throw logError;
    syncLog = logData;

    // Authenticate with external site
    const authResult = await authenticate(externalUsername, externalPassword);

    if (!authResult.success) {
      throw new Error(`Authentication failed: ${authResult.error}`);
    }

    const cookies = authResult.cookies;

    // Fetch schedule page
    const scheduleUrl = `${SCRAPER_CONFIG.baseUrl}/schedule`;
    const scheduleResponse = await authenticatedFetch(scheduleUrl, cookies);

    if (!scheduleResponse.ok) {
      throw new Error(`Failed to fetch schedule: ${scheduleResponse.status}`);
    }

    const scheduleHtml = await scheduleResponse.text();
    let appointments = parseSchedulePage(scheduleHtml);
    appointments = filterBoardingAppointments(appointments);

    result.appointmentsFound = appointments.length;

    // Process each appointment
    for (let i = 0; i < appointments.length; i++) {
      const appt = appointments[i];

      try {
        if (i > 0) {
          await delay(SCRAPER_CONFIG.delayBetweenRequests);
        }

        // Fetch details
        const details = await fetchAppointmentDetails(appt.id, appt.timestamp, cookies);

        // Check for existing dog
        const { data: existingDog } = await supabase
          .from('dogs')
          .select('*')
          .eq('external_id', details.external_id)
          .single();

        let dogId;
        const dogData = mapToDog(details);

        if (existingDog) {
          // Update existing dog
          const { data: updated, error } = await supabase
            .from('dogs')
            .update({ ...dogData, updated_at: new Date().toISOString() })
            .eq('id', existingDog.id)
            .select()
            .single();

          if (error) throw error;
          dogId = updated.id;
          result.appointmentsUpdated++;
        } else {
          // Try to find by name
          const { data: namedDog } = await supabase
            .from('dogs')
            .select('*')
            .ilike('name', dogData.name)
            .limit(1)
            .single();

          if (namedDog && namedDog.source === 'manual') {
            // Link to existing manual entry
            dogId = namedDog.id;
          } else {
            // Create new dog
            const { data: newDog, error } = await supabase
              .from('dogs')
              .insert({ ...dogData, created_at: new Date().toISOString() })
              .select()
              .single();

            if (error) throw error;
            dogId = newDog.id;
            result.appointmentsCreated++;
          }
        }

        // Create/update boarding if we have dates
        if (details.check_in_datetime && details.check_out_datetime) {
          const boardingData = mapToBoarding(details, dogId);

          const { data: existingBoarding } = await supabase
            .from('boardings')
            .select('*')
            .eq('external_id', details.external_id)
            .single();

          if (existingBoarding) {
            await supabase
              .from('boardings')
              .update({ ...boardingData, updated_at: new Date().toISOString() })
              .eq('id', existingBoarding.id);
          } else {
            await supabase
              .from('boardings')
              .insert({ ...boardingData, created_at: new Date().toISOString() });
          }
        }
      } catch (error) {
        result.appointmentsFailed++;
        result.errors.push({
          external_id: appt.id,
          error: sanitizeError(error.message),
        });
      }
    }

    // Determine final status
    result.durationMs = Date.now() - startTime;

    if (result.appointmentsFailed === 0) {
      result.status = SyncStatus.SUCCESS;
      result.success = true;
    } else if (result.appointmentsFailed < result.appointmentsFound) {
      result.status = SyncStatus.PARTIAL;
      result.success = true;
    }

    // Update sync log
    await supabase
      .from('sync_logs')
      .update({
        status: result.status,
        appointments_found: result.appointmentsFound,
        appointments_created: result.appointmentsCreated,
        appointments_updated: result.appointmentsUpdated,
        appointments_failed: result.appointmentsFailed,
        errors: result.errors,
        duration_ms: result.durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLog.id);

    // Update sync settings
    await supabase
      .from('sync_settings')
      .upsert({
        id: 1,
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.status,
        last_sync_message: result.success
          ? `Synced ${result.appointmentsCreated + result.appointmentsUpdated} appointments`
          : `Failed: ${result.errors[0]?.error || 'Unknown error'}`,
        updated_at: new Date().toISOString(),
      });

    return res.status(200).json(result);
  } catch (error) {
    result.durationMs = Date.now() - startTime;
    const sanitizedMsg = sanitizeError(error.message);
    result.errors.push({ error: sanitizedMsg });

    // Update sync log if created
    if (syncLog) {
      await supabase
        .from('sync_logs')
        .update({
          status: SyncStatus.FAILED,
          appointments_found: result.appointmentsFound,
          appointments_failed: result.appointmentsFailed,
          errors: result.errors,
          duration_ms: result.durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id)
        .catch(() => {});
    }

    // Update sync settings
    await supabase
      .from('sync_settings')
      .upsert({
        id: 1,
        last_sync_at: new Date().toISOString(),
        last_sync_status: SyncStatus.FAILED,
        last_sync_message: sanitizedMsg,
        updated_at: new Date().toISOString(),
      })
      .catch(() => {});

    return res.status(500).json({
      ...result,
      error: sanitizedMsg,
    });
  }
}
