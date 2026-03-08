/* global process */
/**
 * Integration check — independent verification of sync health.
 *
 * WHY this is decoupled from src/lib/scraper/:
 *   The sync pipeline parses raw HTML with regexes. If that parser has a bug,
 *   using the same parser here would confirm its wrong output and call it a
 *   pass. This script uses two independent signal paths instead:
 *
 *   1. Playwright renders the schedule page in a real browser, then
 *      document.querySelectorAll reads the live DOM — no regex, no raw HTML.
 *   2. Claude API (vision) reads a screenshot the way a human would —
 *      pixel-level, no DOM parsing at all.
 *
 *   Both signals are compared against the DB to catch bugs the sync pipeline
 *   cannot catch about itself.
 *
 * Flow:
 *   1. Load session cookies from Supabase sync_settings (same cache the crons use)
 *   2. Playwright: render /schedule, take screenshot + extract appointment IDs
 *      from live DOM links
 *   3. Claude API: read screenshot → list dog names visible on the page
 *   4. Supabase: query boardings overlapping today → today+7d
 *   5. Compare → flag missing IDs, Unknown dog names, name mismatches
 *   6. Send WhatsApp text report to NOTIFY_RECIPIENTS
 *
 * Flow:
 *   0. Trigger sync — POST /api/run-sync (runs runSync for today+7d window)
 *   1. Load session cookies from Supabase sync_settings (same cache the crons use)
 *   2. Playwright: render /schedule, take screenshot + extract appointment IDs
 *      from live DOM links
 *   3. Claude API: read screenshot → list dog names visible on the page
 *   4. Supabase: query boardings overlapping today → today+7d
 *   5. Compare → flag missing IDs, Unknown dog names, name mismatches
 *   6. Send WhatsApp text report to INTEGRATION_CHECK_RECIPIENTS (separate from
 *      the roster NOTIFY_RECIPIENTS — this is a technical report for Kate only)
 *
 * Required env vars (GitHub Actions Repository secrets):
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *   INTEGRATION_CHECK_RECIPIENTS  (separate from NOTIFY_RECIPIENTS)
 *   APP_URL                       (Vercel deployment URL for sync trigger)
 *   VITE_SYNC_PROXY_TOKEN         (auth token for /api/run-sync)
 */

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const BASE_URL = 'https://agirlandyourdog.com';
const WINDOW_DAYS = 7;

// Mirrors NON_BOARDING_RE from cron-schedule.js.
// Defined here independently — do not import from src/ to preserve signal isolation.
const NON_BOARDING_PATTERNS = [
  /(d\/c|\bdc\b)/i,
  /(p\/g|g\/p|\bpg\b)/i,
  /\badd\b/,
  /switch\s+day/i,
  /back\s+to\s+\d+/i,
  /initial\s+eval/i,
  /^busy$/i,
];

function isBoardingTitle(title) {
  return !NON_BOARDING_PATTERNS.some(re => re.test(title));
}

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Missing Twilio env vars');
  return twilio(sid, token);
}

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY');
  return new Anthropic({ apiKey: key });
}

function getRecipients() {
  // Intentionally separate from NOTIFY_RECIPIENTS (roster → whole team).
  // Integration check results are technical; they go to Kate only.
  return (process.env.INTEGRATION_CHECK_RECIPIENTS || '').split(',').map(n => n.trim()).filter(Boolean);
}

function maskNumber(n) {
  const d = n.replace(/\D/g, '');
  return `***-***-${d.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Step 0: Trigger sync via /api/run-sync
// ---------------------------------------------------------------------------

/**
 * POST to /api/run-sync and wait for it to complete.
 *
 * This runs before the Playwright scrape so we're comparing against fresh DB
 * data, not yesterday's midnight cron result.
 *
 * Fails loudly — if sync fails, we abort rather than produce a false pass by
 * comparing the scrape against stale data.
 *
 * @param {string} appUrl   - Vercel deployment base URL (APP_URL secret)
 * @param {string} token    - VITE_SYNC_PROXY_TOKEN
 * @returns {Promise<{synced, skipped, failed, durationMs}>}
 */
async function triggerSync(appUrl, token) {
  const url = `${appUrl}/api/run-sync`;
  console.log('[IntegCheck] Step 0: triggering sync at %s...', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const body = await res.json().catch(() => ({}));

  if (res.status === 503 && body.reason === 'no_session') {
    throw new Error('Sync skipped — no valid session cached. Run cron-auth first.');
  }

  if (!res.ok || body.ok === false) {
    throw new Error(
      `Sync endpoint returned ${res.status}: ${body.error ?? JSON.stringify(body)}`
    );
  }

  console.log(
    '[IntegCheck] Sync complete — synced: %d, skipped: %d, failed: %d, duration: %dms',
    body.synced, body.skipped, body.failed, body.durationMs,
  );

  if (body.failed > 0) {
    console.warn('[IntegCheck] ⚠️  Sync reported %d failed appointments: %o', body.failed, body.errors);
  }

  return { synced: body.synced, skipped: body.skipped, failed: body.failed, durationMs: body.durationMs };
}

// ---------------------------------------------------------------------------
// Step 1: Load session cookies from Supabase
// ---------------------------------------------------------------------------

async function loadSession(supabase) {
  console.log('[IntegCheck] Loading session cookies from sync_settings...');

  const { data, error } = await supabase
    .from('sync_settings')
    .select('session_cookies, session_expires_at')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;

  if (!data?.session_cookies) {
    console.log('[IntegCheck] No session_cookies found in DB');
    return null;
  }

  const expiresAt = new Date(data.session_expires_at);
  if (Date.now() >= expiresAt.getTime()) {
    console.log('[IntegCheck] Cached session expired at %s', expiresAt.toISOString());
    return null;
  }

  const remainingH = Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
  console.log('[IntegCheck] Session valid (~%dh remaining)', remainingH);
  return data.session_cookies;
}

// ---------------------------------------------------------------------------
// Step 2: Playwright — render the schedule page
// ---------------------------------------------------------------------------

/**
 * Parse a raw "name=value; name2=value2" cookie string into structured objects
 * for context.addCookies(). Setting cookies as structured objects (vs. extra
 * HTTP headers) ensures they persist across XHR requests the page's JS makes.
 */
function parseCookieString(raw, domain) {
  return raw
    .split(';')
    .map(part => {
      const idx = part.indexOf('=');
      if (idx === -1) return null;
      return {
        name: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim(),
        domain,
        path: '/',
        secure: true,
      };
    })
    .filter(Boolean);
}

/**
 * Render the schedule page in a headless Chromium browser and return:
 *   - screenshot: Buffer (PNG) — for Claude vision
 *   - appointments: Array<{id, title}> — boarding candidates from live DOM
 *
 * Signal independence: document.querySelectorAll reads the rendered DOM after
 * JavaScript execution — completely different from regex on raw server HTML.
 */
async function scrapeWithPlaywright(cookieString) {
  console.log('[IntegCheck] Launching headless Chromium...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const cookies = parseCookieString(cookieString, 'agirlandyourdog.com');
  console.log('[IntegCheck] Injecting %d cookies into browser context', cookies.length);
  await context.addCookies(cookies);

  const page = await context.newPage();
  const scheduleUrl = `${BASE_URL}/schedule`;

  console.log('[IntegCheck] Navigating to %s...', scheduleUrl);
  const response = await page.goto(scheduleUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  console.log('[IntegCheck] Page loaded — HTTP %d', response.status());

  // Detect session rejection — AGYD redirects to login if cookies are stale
  const isLoginPage = await page.locator('input[type="password"]').count();
  if (isLoginPage > 0) {
    await browser.close();
    throw new Error('SESSION_REJECTED — AGYD served login page. Run cron-auth to refresh session.');
  }

  console.log('[IntegCheck] Taking full-page screenshot...');
  const screenshot = await page.screenshot({ fullPage: true });
  console.log('[IntegCheck] Screenshot: %d bytes', screenshot.length);

  // Extract appointment IDs + titles from rendered DOM links.
  // This reads the live post-JS DOM, not raw HTML — a different failure surface
  // than the cron-schedule regex parser.
  console.log('[IntegCheck] Extracting appointment links from rendered DOM...');
  const allAppointments = await page.evaluate(() => {
    const seen = new Set();
    const results = [];
    document.querySelectorAll('a[href*="/schedule/a/"]').forEach(a => {
      const m = a.href.match(/\/schedule\/a\/([^/]+)\/\d+/);
      if (!m) return;
      const id = m[1];
      if (seen.has(id)) return;
      seen.add(id);
      const title = a.querySelector('.day-event-title')?.textContent?.trim() ?? '';
      results.push({ id, title });
    });
    return results;
  });

  const appointments = allAppointments.filter(a => isBoardingTitle(a.title));
  console.log(
    '[IntegCheck] DOM links: %d total, %d boarding candidates after non-boarding filter',
    allAppointments.length,
    appointments.length,
  );

  await browser.close();
  return { screenshot, appointments };
}

// ---------------------------------------------------------------------------
// Step 3: Claude vision — read dog names from screenshot
// ---------------------------------------------------------------------------

/**
 * Ask Claude to identify every boarding appointment visible in the screenshot.
 * Claude reads pixels — no DOM parsing, no regex — fully independent signal.
 *
 * Returns dog names Claude sees on the page. Cross-checked against DB names
 * to catch cases where the sync stored a wrong or "Unknown" name.
 */
async function extractNamesFromScreenshot(client, screenshotBuffer) {
  console.log('[IntegCheck] Sending screenshot to Claude for visual name extraction...');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshotBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: `This is a screenshot of a dog boarding facility's weekly schedule page.
List every BOARDING appointment you can see. Skip daycare (DC), pack group (PG), and other non-boarding events.
For each boarding, extract the dog's name — it's the first word in the appointment title, before any date or parenthetical.
Return ONLY a valid JSON array of name strings. Example: ["Buddy", "Goose", "Max"]
If you see no boardings, return: []`,
          },
        ],
      },
    ],
  });

  const raw = message.content[0].text.trim();
  console.log('[IntegCheck] Claude raw response: %s', raw);

  try {
    const match = raw.match(/\[[\s\S]*\]/);
    const names = match ? JSON.parse(match[0]) : [];
    console.log('[IntegCheck] Claude identified %d dog name(s): %s', names.length, names.join(', ') || '(none)');
    return names;
  } catch (err) {
    console.error('[IntegCheck] Failed to parse Claude response as JSON: %s', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 4: Query DB
// ---------------------------------------------------------------------------

async function queryDbBoardings(supabase) {
  const now = new Date().toISOString();
  const windowEnd = new Date(Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log('[IntegCheck] Querying DB for boardings overlapping now → now+%dd...', WINDOW_DAYS);

  const { data, error } = await supabase
    .from('boardings')
    .select('external_id, arrival_datetime, departure_datetime, dogs(name)')
    .lte('arrival_datetime', windowEnd)
    .gte('departure_datetime', now);

  if (error) throw error;

  const boardings = (data || []).map(b => ({
    external_id: b.external_id,
    dog_name: b.dogs?.name ?? 'Unknown',
    arrival: b.arrival_datetime,
    departure: b.departure_datetime,
  }));

  console.log('[IntegCheck] DB returned %d boarding(s) in window', boardings.length);
  return boardings;
}

// ---------------------------------------------------------------------------
// Step 5: Compare
// ---------------------------------------------------------------------------

/**
 * Three checks:
 *   1. Schedule IDs missing from DB — scraped but never synced
 *   2. DB boardings with "Unknown" dog name — name extraction failed during sync
 *   3. Claude sees a name not present in any DB boarding — name mismatch
 *      (only flagged when Claude returned names; skipped on empty schedule)
 */
function compareResults(scraped, claudeNames, dbBoardings) {
  const issues = [];
  const dbIds = new Set(dbBoardings.map(b => b.external_id).filter(Boolean));
  const dbNamesLower = new Set(dbBoardings.map(b => b.dog_name.toLowerCase()));

  // Check 1: IDs on schedule not in DB
  for (const appt of scraped) {
    if (!dbIds.has(appt.id)) {
      console.log('[IntegCheck] ⚠️  Missing from DB: %s ("%s")', appt.id, appt.title);
      issues.push(`Missing from DB: ${appt.id} ("${appt.title}")`);
    }
  }

  // Check 2: Unknown dog names in the current window
  for (const b of dbBoardings.filter(b => !b.dog_name || b.dog_name === 'Unknown')) {
    console.log('[IntegCheck] ⚠️  Unknown dog in DB: external_id=%s', b.external_id);
    issues.push(`Unknown dog name in DB: ${b.external_id ?? '(no external_id)'}`);
  }

  // Check 3: Claude sees a name the DB doesn't have
  if (claudeNames.length > 0) {
    for (const name of claudeNames) {
      if (!dbNamesLower.has(name.toLowerCase())) {
        console.log('[IntegCheck] ⚠️  Claude sees "%s" on schedule but no DB boarding matches', name);
        issues.push(`Claude sees "${name}" on schedule but no DB boarding matches`);
      }
    }
  }

  const passed = issues.length === 0;
  console.log('[IntegCheck] Result: %s (%d issue(s))', passed ? 'PASS ✅' : 'FAIL ⚠️', issues.length);
  return { passed, issues };
}

// ---------------------------------------------------------------------------
// Step 6: WhatsApp
// ---------------------------------------------------------------------------

async function sendWhatsApp(twilioClient, message) {
  const recipients = getRecipients();
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!from) {
    console.error('[IntegCheck] Missing TWILIO_FROM_NUMBER — cannot send WhatsApp');
    return;
  }
  if (recipients.length === 0) {
    console.log('[IntegCheck] No NOTIFY_RECIPIENTS configured — skipping WhatsApp send');
    return;
  }

  console.log('[IntegCheck] Sending WhatsApp to %d recipient(s)...', recipients.length);
  for (const to of recipients) {
    try {
      const msg = await twilioClient.messages.create({
        from: `whatsapp:${from}`,
        to: `whatsapp:${to}`,
        body: message,
      });
      console.log('[IntegCheck] Sent to %s — SID: %s', maskNumber(to), msg.sid);
    } catch (err) {
      console.error('[IntegCheck] Twilio error for %s — code %s: %s', maskNumber(to), err.code, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[IntegCheck] === Integration check starting ===');

  const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  const supabase = getSupabase();
  const anthropic = getAnthropicClient();
  const twilioClient = getTwilioClient();

  const appUrl = process.env.APP_URL;
  const syncToken = process.env.VITE_SYNC_PROXY_TOKEN;
  if (!appUrl || !syncToken) throw new Error('Missing APP_URL or VITE_SYNC_PROXY_TOKEN');

  // Step 0: Sync — must succeed before we compare, or we risk a false pass on stale data
  try {
    await triggerSync(appUrl, syncToken);
  } catch (err) {
    const msg = `⚠️ Integration check aborted (${today})\nSync failed: ${err.message}`;
    console.error('[IntegCheck]', msg);
    await sendWhatsApp(twilioClient, msg);
    process.exit(1);
  }

  // Step 1: Session
  const cookieString = await loadSession(supabase);
  if (!cookieString) {
    const msg = `⚠️ Integration check skipped (${today})\nNo valid session cached. Run cron-auth first.`;
    console.log('[IntegCheck]', msg);
    await sendWhatsApp(twilioClient, msg);
    process.exit(0);
  }

  // Step 2: Playwright
  let screenshot, appointments;
  try {
    ({ screenshot, appointments } = await scrapeWithPlaywright(cookieString));
  } catch (err) {
    const msg = `⚠️ Integration check failed (${today})\nPlaywright error: ${err.message}`;
    console.error('[IntegCheck]', msg);
    await sendWhatsApp(twilioClient, msg);
    process.exit(1);
  }

  // Step 3: Claude vision (non-fatal — continue without it if API is down)
  let claudeNames = [];
  try {
    claudeNames = await extractNamesFromScreenshot(anthropic, screenshot);
  } catch (err) {
    console.error('[IntegCheck] Claude vision failed (skipping name check): %s', err.message);
  }

  // Step 4: DB
  const dbBoardings = await queryDbBoardings(supabase);

  // Step 5: Compare
  const { passed, issues } = compareResults(appointments, claudeNames, dbBoardings);

  // Step 6: Report
  let message;
  if (passed) {
    const n = dbBoardings.length;
    message = `✅ Integration check passed (${today})\n${n} boarding${n !== 1 ? 's' : ''} — all match DB`;
  } else {
    message = `⚠️ Integration check found issues (${today})\n${issues.map(i => `• ${i}`).join('\n')}`;
  }

  console.log('[IntegCheck] === Final report ===\n%s', message);
  await sendWhatsApp(twilioClient, message);

  console.log('[IntegCheck] === Done ===');
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('[IntegCheck] Unhandled error:', err.message, err.stack);
  process.exit(1);
});
