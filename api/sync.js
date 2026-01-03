/**
 * Sync API endpoint - Server-side proxy for external site scraping
 * @requirements REQ-108
 *
 * Uses Edge Runtime to bypass CORS when fetching from external booking system.
 */

export const config = {
  runtime: 'edge',
};

// Simple Supabase client using fetch (Edge-compatible)
function createSupabaseClient(url, key) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  return {
    from: (table) => ({
      select: (columns = '*') => ({
        eq: (field, value) => ({
          single: async () => {
            const res = await fetch(`${url}/rest/v1/${table}?${field}=eq.${encodeURIComponent(value)}&select=${columns}`, { headers });
            const data = await res.json();
            if (!res.ok) return { data: null, error: data };
            return { data: data[0] || null, error: data[0] ? null : { code: 'PGRST116' } };
          },
          limit: () => ({
            single: async () => {
              const res = await fetch(`${url}/rest/v1/${table}?${field}=eq.${encodeURIComponent(value)}&select=${columns}&limit=1`, { headers });
              const data = await res.json();
              if (!res.ok) return { data: null, error: data };
              return { data: data[0] || null, error: data[0] ? null : { code: 'PGRST116' } };
            },
          }),
        }),
        ilike: (field, value) => ({
          limit: () => ({
            single: async () => {
              const res = await fetch(`${url}/rest/v1/${table}?${field}=ilike.${encodeURIComponent(value)}&select=${columns}&limit=1`, { headers });
              const data = await res.json();
              if (!res.ok) return { data: null, error: data };
              return { data: data[0] || null, error: data[0] ? null : { code: 'PGRST116' } };
            },
          }),
        }),
        single: async () => {
          const res = await fetch(`${url}/rest/v1/${table}?select=${columns}&limit=1`, { headers });
          const data = await res.json();
          if (!res.ok) return { data: null, error: data };
          return { data: data[0] || null, error: null };
        },
      }),
      insert: (record) => ({
        select: () => ({
          single: async () => {
            const res = await fetch(`${url}/rest/v1/${table}`, {
              method: 'POST',
              headers,
              body: JSON.stringify(record),
            });
            const data = await res.json();
            if (!res.ok) return { data: null, error: data };
            return { data: data[0] || data, error: null };
          },
        }),
      }),
      update: (record) => ({
        eq: (field, value) => ({
          select: () => ({
            single: async () => {
              const res = await fetch(`${url}/rest/v1/${table}?${field}=eq.${encodeURIComponent(value)}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(record),
              });
              const data = await res.json();
              if (!res.ok) return { data: null, error: data };
              return { data: data[0] || data, error: null };
            },
          }),
        }),
      }),
      upsert: async (record) => {
        const res = await fetch(`${url}/rest/v1/${table}`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(record),
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: data };
        return { data: data[0] || data, error: null };
      },
    }),
  };
}

// Config
const SCRAPER_CONFIG = {
  baseUrl: process.env.VITE_EXTERNAL_SITE_URL || 'https://agirlandyourdog.com',
  delayBetweenRequests: 1500,
};

// Sync status enum
const SyncStatus = {
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
};

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

function extractCsrfToken(html) {
  const patterns = [
    /<input[^>]*name="_token"[^>]*value="([^"]+)"/i,
    /<input[^>]*name="csrf_token"[^>]*value="([^"]+)"/i,
    /<meta[^>]*name="csrf-token"[^>]*content="([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function combineCookies(...cookieStrings) {
  const cookies = new Map();
  for (const cookieString of cookieStrings) {
    if (!cookieString) continue;
    const parts = cookieString.split(/,(?=[^;]+=[^;]+)/);
    for (const part of parts) {
      const [nameValue] = part.split(';');
      const eqIndex = nameValue.indexOf('=');
      if (eqIndex > 0) {
        const name = nameValue.substring(0, eqIndex).trim();
        const value = nameValue.substring(eqIndex + 1).trim();
        if (name && value) cookies.set(name, value);
      }
    }
  }
  return Array.from(cookies.entries()).map(([n, v]) => `${n}=${v}`).join('; ');
}

async function authenticate(username, password) {
  if (!username || !password) {
    return { success: false, error: 'Username and password are required' };
  }

  try {
    const loginUrl = `${SCRAPER_CONFIG.baseUrl}/login`;
    const loginPageResponse = await fetch(loginUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)' },
    });

    if (!loginPageResponse.ok) {
      return { success: false, error: `Failed to load login page: ${loginPageResponse.status}` };
    }

    const initialCookies = loginPageResponse.headers.get('set-cookie') || '';
    const loginPageHtml = await loginPageResponse.text();
    const csrfToken = extractCsrfToken(loginPageHtml);

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

  const seen = new Set();
  return appointments.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

function filterBoardingAppointments(appointments) {
  const keywords = ['boarding', 'overnight', 'night'];
  return appointments.filter(a => {
    const title = (a.title || '').toLowerCase();
    return keywords.some(kw => title.includes(kw));
  });
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function parseAppointmentPage(html, sourceUrl = '') {
  const emailMatch = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = html.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

  const parseDateTime = (dateStr) => {
    if (!dateStr) return null;
    try {
      const isPM = /pm/i.test(dateStr);
      const isAM = /am/i.test(dateStr);
      const months = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
      const monthMatch = dateStr.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)/i);
      const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
      const yearMatch = dateStr.match(/\b(20\d{2})\b/);

      if (monthMatch && dayMatch && yearMatch) {
        const month = months[monthMatch[0].toLowerCase()];
        const day = parseInt(dayMatch[1], 10);
        const year = parseInt(yearMatch[1], 10);
        const hour = isPM ? 17 : (isAM ? 10 : 12);
        return new Date(Date.UTC(year, month, day, hour, 0, 0)).toISOString();
      }
    } catch (e) {}
    return null;
  };

  const checkInMatch = html.match(/check[- ]?in[:\s]*([^<]+)/i);
  const checkOutMatch = html.match(/check[- ]?out[:\s]*([^<]+)/i);
  const h1Match = html.match(/<h1[^>]*>([^<]+)/i);
  const petNameMatch = html.match(/class="[^"]*(?:pet|dog)[^"]*name[^"]*"[^>]*>([^<]+)/i);

  return {
    source_url: sourceUrl,
    service_type: h1Match ? cleanText(h1Match[1]) : null,
    check_in_datetime: parseDateTime(checkInMatch ? checkInMatch[1] : null),
    check_out_datetime: parseDateTime(checkOutMatch ? checkOutMatch[1] : null),
    client_email_primary: emailMatch ? emailMatch[0] : null,
    client_phone: phoneMatch ? phoneMatch[0] : null,
    pet_name: petNameMatch ? cleanText(petNameMatch[1]) : null,
  };
}

async function fetchAppointmentDetails(appointmentId, timestamp, cookies) {
  const url = timestamp
    ? `${SCRAPER_CONFIG.baseUrl}/schedule/a/${appointmentId}/${timestamp}`
    : `${SCRAPER_CONFIG.baseUrl}/schedule/a/${appointmentId}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
      'Cookie': cookies,
    },
  });

  if (!response.ok) throw new Error(`Failed to fetch appointment ${appointmentId}: ${response.status}`);
  const html = await response.text();
  if (html.includes('login') && html.includes('password')) {
    throw new Error('Session expired');
  }

  const data = parseAppointmentPage(html, url);
  data.external_id = appointmentId;
  return data;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapToDog(external) {
  return {
    name: external.pet_name || 'Unknown',
    source: 'external',
    external_id: external.external_id,
    active: true,
    day_rate: 0,
    night_rate: 0,
    owner_email: external.client_email_primary || null,
    owner_phone: external.client_phone || null,
  };
}

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

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  const externalUsername = process.env.VITE_EXTERNAL_SITE_USERNAME;
  const externalPassword = process.env.VITE_EXTERNAL_SITE_PASSWORD;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Supabase configuration missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!externalUsername || !externalPassword) {
    return new Response(JSON.stringify({ error: 'External site credentials not configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
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
    const { data: logData, error: logError } = await supabase
      .from('sync_logs')
      .insert({ status: SyncStatus.RUNNING, started_at: new Date().toISOString() })
      .select()
      .single();

    if (logError) throw logError;
    syncLog = logData;

    const authResult = await authenticate(externalUsername, externalPassword);
    if (!authResult.success) {
      throw new Error(`Authentication failed: ${authResult.error}`);
    }

    const cookies = authResult.cookies;
    const scheduleUrl = `${SCRAPER_CONFIG.baseUrl}/schedule`;
    const scheduleResponse = await fetch(scheduleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DogBoardingSync/2.0)',
        'Cookie': cookies,
      },
    });

    if (!scheduleResponse.ok) {
      throw new Error(`Failed to fetch schedule: ${scheduleResponse.status}`);
    }

    const scheduleHtml = await scheduleResponse.text();
    let appointments = parseSchedulePage(scheduleHtml);
    appointments = filterBoardingAppointments(appointments);
    result.appointmentsFound = appointments.length;

    for (let i = 0; i < appointments.length; i++) {
      const appt = appointments[i];
      try {
        if (i > 0) await delay(SCRAPER_CONFIG.delayBetweenRequests);

        const details = await fetchAppointmentDetails(appt.id, appt.timestamp, cookies);
        const { data: existingDog } = await supabase
          .from('dogs').select('*').eq('external_id', details.external_id).single();

        let dogId;
        const dogData = mapToDog(details);

        if (existingDog) {
          const { data: updated, error } = await supabase
            .from('dogs')
            .update({ ...dogData, updated_at: new Date().toISOString() })
            .eq('id', existingDog.id).select().single();
          if (error) throw error;
          dogId = updated.id;
          result.appointmentsUpdated++;
        } else {
          const { data: namedDog } = await supabase
            .from('dogs').select('*').ilike('name', dogData.name).limit(1).single();

          if (namedDog && namedDog.source === 'manual') {
            dogId = namedDog.id;
          } else {
            const { data: newDog, error } = await supabase
              .from('dogs')
              .insert({ ...dogData, created_at: new Date().toISOString() })
              .select().single();
            if (error) throw error;
            dogId = newDog.id;
            result.appointmentsCreated++;
          }
        }

        if (details.check_in_datetime && details.check_out_datetime) {
          const boardingData = mapToBoarding(details, dogId);
          const { data: existingBoarding } = await supabase
            .from('boardings').select('*').eq('external_id', details.external_id).single();

          if (existingBoarding) {
            await supabase.from('boardings')
              .update({ ...boardingData, updated_at: new Date().toISOString() })
              .eq('id', existingBoarding.id);
          } else {
            await supabase.from('boardings')
              .insert({ ...boardingData, created_at: new Date().toISOString() });
          }
        }
      } catch (error) {
        result.appointmentsFailed++;
        result.errors.push({ external_id: appt.id, error: sanitizeError(error.message) });
      }
    }

    result.durationMs = Date.now() - startTime;
    if (result.appointmentsFailed === 0) {
      result.status = SyncStatus.SUCCESS;
      result.success = true;
    } else if (result.appointmentsFailed < result.appointmentsFound) {
      result.status = SyncStatus.PARTIAL;
      result.success = true;
    }

    await supabase.from('sync_logs').update({
      status: result.status,
      appointments_found: result.appointmentsFound,
      appointments_created: result.appointmentsCreated,
      appointments_updated: result.appointmentsUpdated,
      appointments_failed: result.appointmentsFailed,
      errors: result.errors,
      duration_ms: result.durationMs,
      completed_at: new Date().toISOString(),
    }).eq('id', syncLog.id);

    await supabase.from('sync_settings').upsert({
      id: 1,
      last_sync_at: new Date().toISOString(),
      last_sync_status: result.status,
      last_sync_message: result.success
        ? `Synced ${result.appointmentsCreated + result.appointmentsUpdated} appointments`
        : `Failed: ${result.errors[0]?.error || 'Unknown error'}`,
      updated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    result.durationMs = Date.now() - startTime;
    const sanitizedMsg = sanitizeError(error.message);
    result.errors.push({ error: sanitizedMsg });

    if (syncLog) {
      await supabase.from('sync_logs').update({
        status: SyncStatus.FAILED,
        appointments_found: result.appointmentsFound,
        appointments_failed: result.appointmentsFailed,
        errors: result.errors,
        duration_ms: result.durationMs,
        completed_at: new Date().toISOString(),
      }).eq('id', syncLog.id).catch(() => {});
    }

    await supabase.from('sync_settings').upsert({
      id: 1,
      last_sync_at: new Date().toISOString(),
      last_sync_status: SyncStatus.FAILED,
      last_sync_message: sanitizedMsg,
      updated_at: new Date().toISOString(),
    }).catch(() => {});

    return new Response(JSON.stringify({ ...result, error: sanitizedMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
