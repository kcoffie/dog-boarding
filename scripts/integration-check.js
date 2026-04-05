/* global process */
/**
 * Integration check — independent verification of sync health.
 *
 * WHY this is decoupled from src/lib/scraper/ for Steps 2–5:
 *   The sync pipeline parses raw HTML with regexes. If that parser has a bug,
 *   using the same parser here would confirm its wrong output and call it a
 *   pass. Steps 2–5 use two independent signal paths instead:
 *
 *   1. Playwright renders the schedule page in a real browser, then
 *      document.querySelectorAll reads the live DOM — no regex, no raw HTML.
 *   2. Claude API (vision) reads a screenshot the way a human would —
 *      pixel-level, no DOM parsing at all.
 *
 *   Both signals are compared against the DB to catch bugs the sync pipeline
 *   cannot catch about itself.
 *
 * WHY NON_BOARDING_PATTERNS uses the shared SCRAPER_CONFIG.nonBoardingPatterns:
 *   Single source of truth — all sync paths (browser UI via sync.js, Vercel
 *   crons via syncRunner.js, and this check) share one definition in config.js.
 *   The independent verification signal is Playwright rendering the live DOM,
 *   not a duplicate copy of the filter logic.
 *
 * Flow:
 *   0. Sync-before-compare: run schedule sync + drain detail queue so any
 *      bookings added since the midnight cron are in the DB before we compare.
 *      Non-fatal — if sync fails, the check continues with the current DB state.
 *   1. Load session cookies from Supabase sync_settings (same cache the crons use)
 *   2. Playwright: render /schedule, take screenshot + extract appointment IDs
 *      from live DOM links (boarding + daytime)
 *   3. Claude API: read screenshot → list dog names visible on the page
 *   4. Supabase: query boardings overlapping today → today+7d; query daytime_appointments for today
 *   5. Compare → flag missing IDs, Unknown dog names, name mismatches (boarding);
 *      flag missing daytime events (daytime smoke check)
 *   6. Send WhatsApp text report to INTEGRATION_CHECK_RECIPIENTS (separate from
 *      the roster NOTIFY_RECIPIENTS — this is a technical report for Kate only)
 *
 * Required env vars (GitHub Actions Repository secrets):
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   EXTERNAL_SITE_USERNAME, EXTERNAL_SITE_PASSWORD  (for Step 0 re-auth on session expiry)
 *   ANTHROPIC_API_KEY
 *   META_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN
 *   INTEGRATION_CHECK_RECIPIENTS  (separate from NOTIFY_RECIPIENTS)
 */

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendTextMessage, getAlertRecipients } from '../src/lib/notifyWhatsApp.js';
import { recordSentMessages } from '../src/lib/messageDeliveryStatus.js';
import { runScheduleSync, runDetailSync } from '../src/lib/scraper/syncRunner.js';
import { resetStuck } from '../src/lib/scraper/syncQueue.js';
import { SCRAPER_CONFIG } from '../src/lib/scraper/config.js';

const BASE_URL = 'https://agirlandyourdog.com';
const WINDOW_DAYS = 7;
const PLAYWRIGHT_TIMEOUT_MS = 30_000;

// The 1am PDT run (08:00 UTC) is the daily baseline — always send its report.
// Runs 2 (9am PDT, 16:00 UTC) and 3 (5pm PDT, 00:00 UTC) are suppressed when
// the check passes — if nothing is wrong, a repeat "all good" message is noise.
// Manual workflow_dispatch has an empty schedule string — treat as always-send.
const FIRST_RUN_SCHEDULE = '0 8 * * *';
const alwaysSend =
  !process.env.INTEGRATION_CHECK_SCHEDULE ||
  process.env.INTEGRATION_CHECK_SCHEDULE === FIRST_RUN_SCHEDULE;

// Non-boarding title filter — uses the canonical definition from config.js so
// all sync execution paths (browser UI, Vercel crons, integration check) behave
// identically. See SCRAPER_CONFIG.nonBoardingPatterns for the full rationale.
function isBoardingTitle(title) {
  return !SCRAPER_CONFIG.nonBoardingPatterns.some(re => re.test(title));
}

// Daycare-only filter — local to integration-check only. NOT added to
// config.js/nonBoardingPatterns because "PG 3/23-30" style titles ARE real
// boardings that must sync. These patterns only appear in the integration
// check context where the pricing filter (which correctly excludes daycares)
// cannot run without fetching detail pages.
//
// Confirmed false positives (31 total March 2026; +2 April 2026):
//   - PG daycare with delimiters: "P/G M/T/W/Th", "PG:FT", "PG: MWTH OFF OFF", etc.
//   - PG daycare with concatenated days: "P/G MTWTH", "P/G TWTH", "PG:WTH"
//   - Make up days: "Moonbeam — Make up days T.F"
//   - No charge: "Peanut — No charge"
//   - Weekend standalone daycare: "Weekend Daycare" (April 2026)
//   - New client initial eval: "N/C Tula 3/23-26" (April 2026) — N/C = new client,
//     always an Initial Evaluation daytime visit, never an overnight boarding.
//     The sync filters this via the detail-page service_type ("Initial Evaluation"
//     matches /initial\s+eval/i in nonBoardingPatterns); the integration check only
//     sees the schedule title, so the N/C prefix must be caught here.
//
// Two PG patterns are needed:
//   1. Delimited days — uses \b word boundaries (catches M/T/W/Th, PG FT, etc.)
//   2. Concatenated days — TH must come before single letters in the alternation
//      so "MTWTH" parses as M+T+W+TH rather than M+T+W+T with a leftover H.
const DAYCARE_ONLY_PATTERNS = [
  /\bP\/?G\b.*\b(M|T|W|Th|F|FT|OFF)\b/i,
  /\bP\/?G[: .]?\s*(?:TH|[MTWF])+\b/i,
  /make.?up days/i,
  /no charge/i,
  /\bdaycare\b/i,
  /\bN\/C\b/i,
];
function isDaycareOnlyTitle(title) {
  return DAYCARE_ONLY_PATTERNS.some(re => re.test(title));
}

// Daytime service category IDs — mirrors SERVICE_CATS in daytimeSchedule.js.
// Defined here independently to preserve signal isolation from src/.
const DAYTIME_CAT_IDS = [5634, 7431]; // DC, PG

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY');
  return new Anthropic({ apiKey: key });
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
    .maybeSingle(); // .single() logs HTTP 406 to Supabase console on 0 rows even when caught

  if (error) throw error;

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
 *   - boardingAppointments: Array<{id, title}> — boarding candidates from live DOM
 *   - daytimeAppointments: Array<{id, catId, dayTs, title}> — DC/PG events from live DOM
 *
 * Signal independence: document.querySelectorAll reads the rendered DOM after
 * JavaScript execution — completely different from regex on raw server HTML.
 *
 * Browser is always closed via try/finally, even if screenshot or evaluate throws.
 */
async function scrapeWithPlaywright(cookieString) {
  console.log('[IntegCheck] Launching headless Chromium...');
  const browser = await chromium.launch();

  try {
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
    const response = await page.goto(scheduleUrl, { waitUntil: 'networkidle', timeout: PLAYWRIGHT_TIMEOUT_MS });
    console.log('[IntegCheck] Page loaded — HTTP %d', response.status());

    // Detect session rejection — AGYD redirects to login if cookies are stale
    const isLoginPage = await page.locator('input[type="password"]').count();
    if (isLoginPage > 0) {
      throw new Error('SESSION_REJECTED — AGYD served login page. Run cron-auth to refresh session.');
    }

    console.log('[IntegCheck] Taking full-page screenshot...');
    const screenshot = await page.screenshot({ fullPage: true });
    console.log('[IntegCheck] Screenshot: %d bytes', screenshot.length);

    // Extract appointment IDs + titles from rendered DOM.
    // Boarding: schedule/a/ links. Daytime: .day-event links with cat-{id} class.
    // Reads the live post-JS DOM — different failure surface than cron-schedule regex parser.
    console.log('[IntegCheck] Extracting appointment links from rendered DOM...');
    const { allBoardingAppts, daytimeAppointments } = await page.evaluate((daytimeCatIds) => {
      const seenBoarding = new Set();
      const allBoardingAppts = [];
      document.querySelectorAll('a[href*="/schedule/a/"]').forEach(a => {
        const m = a.href.match(/\/schedule\/a\/([^/]+)\/\d+/);
        if (!m) return;
        const id = m[1];
        if (seenBoarding.has(id)) return;
        seenBoarding.add(id);
        const title = a.querySelector('.day-event-title')?.textContent?.trim() ?? '';
        const petName = a.querySelector('.event-pet')?.textContent?.trim() ?? '';
        allBoardingAppts.push({ id, title, petName });
      });

      const seenDaytime = new Set();
      const daytimeAppointments = [];
      document.querySelectorAll('a.day-event').forEach(a => {
        const catMatch = a.className.match(/\bcat-(\d+)\b/);
        if (!catMatch) return;
        const catId = parseInt(catMatch[1], 10);
        if (!daytimeCatIds.includes(catId)) return;
        const id = a.dataset.id;
        if (!id || seenDaytime.has(id)) return;
        seenDaytime.add(id);
        const dayTs = parseInt(a.dataset.ts || '0', 10);
        const title = a.querySelector('.day-event-title')?.textContent?.trim() ?? '';
        const petName = a.querySelector('.event-pet')?.textContent?.trim() ?? '';
        daytimeAppointments.push({ id, catId, dayTs, title, petName });
      });

      return { allBoardingAppts, daytimeAppointments };
    }, DAYTIME_CAT_IDS);

    const boardingAppointments = allBoardingAppts
      .filter(a => isBoardingTitle(a.title))
      .filter(a => !isDaycareOnlyTitle(a.title));
    console.log(
      '[IntegCheck] DOM boarding links: %d total, %d candidates after non-boarding + daycare-only filter',
      allBoardingAppts.length,
      boardingAppointments.length,
    );
    console.log('[IntegCheck] DOM daytime events: %d DC/PG events extracted', daytimeAppointments.length);

    return { screenshot, boardingAppointments, daytimeAppointments };
  } finally {
    // Always close the browser — even if screenshot or evaluate threw.
    await browser.close();
  }
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
 *
 * Response is validated to be string[] before returning — Claude occasionally
 * returns mixed types (numbers, null) that would crash .toLowerCase() downstream.
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
    const parsed = match ? JSON.parse(match[0]) : [];

    // Validate every element is a non-empty string. Claude occasionally returns
    // numbers or null in the array, which would crash .toLowerCase() in compareResults.
    const names = Array.isArray(parsed)
      ? parsed.filter(n => typeof n === 'string' && n.trim().length > 0)
      : [];

    if (names.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      console.warn(
        '[IntegCheck] Claude response contained %d non-string/empty entries — filtered out (raw: %s)',
        (Array.isArray(parsed) ? parsed.length : 0) - names.length,
        raw.slice(0, 200),
      );
    }

    console.log('[IntegCheck] Claude identified %d dog name(s): %s', names.length, names.join(', ') || '(none)');
    return names;
  } catch (err) {
    console.error('[IntegCheck] Failed to parse Claude response as JSON: %s (raw: %s)', err.message, raw.slice(0, 200));
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 4: Query DB
// ---------------------------------------------------------------------------

async function queryDbBoardings(supabase) {
  // Lower bound: 7 days ago — the schedule page shows the current week plus
  // some days of the previous week, so past-departed boardings still visible
  // on the page must be included or they'd be falsely flagged as missing.
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log('[IntegCheck] Querying DB for boardings overlapping past 7d → today+%dd (%s → %s)...', WINDOW_DAYS, windowStart.toISOString(), windowEnd);

  const { data, error } = await supabase
    .from('boardings')
    .select('external_id, arrival_datetime, departure_datetime, dogs(name)')
    .lte('arrival_datetime', windowEnd)
    .gte('departure_datetime', windowStart.toISOString());

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

async function queryDbDaytimeAppointments(supabase) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  console.log('[IntegCheck] Querying DB for daytime appointments on %s...', todayStr);

  const { data, error } = await supabase
    .from('daytime_appointments')
    .select('external_id, service_category, title')
    .eq('appointment_date', todayStr);

  if (error) throw error;

  const appointments = (data || []).map(a => ({
    external_id: a.external_id,
    service_category: a.service_category,
    title: a.title,
  }));

  console.log('[IntegCheck] DB returned %d daytime appointment(s) for today', appointments.length);
  return appointments;
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
 *
 * Known limitation: Check 3 compares first-word names (Claude) against full
 * DB names (lowercase). "Buddy Jr." in DB won't match "Buddy" from Claude —
 * this is an acceptable false positive rate for a smoke test.
 */
function compareResults(scraped, claudeNames, dbBoardings) {
  const issues = [];
  const dbIds = new Set(dbBoardings.map(b => b.external_id).filter(Boolean));
  const dbNamesLower = new Set(dbBoardings.map(b => b.dog_name.toLowerCase()));

  // Check 1: IDs on schedule not in DB
  for (const appt of scraped) {
    if (!dbIds.has(appt.id)) {
      const label = appt.petName ? `${appt.petName} — ${appt.title}` : appt.title;
      console.log('[IntegCheck] ⚠️  Missing from DB: %s ("%s")', appt.id, label);
      issues.push(`Missing from DB: ${label} (${appt.id})`);
    }
  }

  // Check 2: DB boardings with Unknown dog name in the current window.
  // dog_name is always set (defaults to 'Unknown' in queryDbBoardings) so
  // we only need the explicit 'Unknown' check here.
  for (const b of dbBoardings.filter(b => b.dog_name === 'Unknown')) {
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

/**
 * Smoke check: daytime DC/PG appointments visible in today's DOM column
 * should be present in the DB for today.
 *
 * Filters DOM events to today's day column (by dayTs), then checks each
 * external_id against the DB result for today.
 *
 * Returns { passed, issues, domCount, dbCount }.
 */
function compareDaytimeResults(domDaytime, dbDaytime) {
  const issues = [];

  // Filter to today's day column only (dayTs is midnight of the column in Unix seconds)
  const todayMidnightSec = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const tomorrowMidnightSec = todayMidnightSec + 86400;
  const todayDom = domDaytime.filter(a => a.dayTs >= todayMidnightSec && a.dayTs < tomorrowMidnightSec);

  const dbIds = new Set(dbDaytime.map(a => a.external_id));

  for (const appt of todayDom) {
    if (!dbIds.has(appt.id)) {
      const label = appt.petName ? `${appt.petName} — ${appt.title}` : appt.title;
      console.log('[IntegCheck] ⚠️  Daytime missing from DB: %s ("%s")', appt.id, label);
      issues.push(`Daytime missing from DB: ${label} (${appt.id})`);
    }
  }

  const passed = issues.length === 0;
  console.log(
    '[IntegCheck] Daytime result: %s — DOM today: %d, DB today: %d, issues: %d',
    passed ? 'PASS ✅' : 'FAIL ⚠️',
    todayDom.length,
    dbDaytime.length,
    issues.length,
  );
  return { passed, issues, domCount: todayDom.length, dbCount: dbDaytime.length };
}

// ---------------------------------------------------------------------------
// Step 6: WhatsApp
// ---------------------------------------------------------------------------

async function sendAlertMessage(message, supabase = null) {
  const recipients = getAlertRecipients();
  console.log('[IntegCheck] Sending WhatsApp to %d recipient(s)...', recipients.length);
  const results = await sendTextMessage(message, recipients);
  const sent = results.filter(r => r.status === 'sent').length;
  console.log('[IntegCheck] WhatsApp: %d/%d sent', sent, recipients.length);
  // supabase is null at startup-crash call site — recordSentMessages handles null gracefully.
  await recordSentMessages(supabase, results, 'integration-check').catch(err =>
    console.warn('[IntegCheck] Failed to record delivery status: %s', err.message)
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[IntegCheck] === Integration check starting ===');

  const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

  let supabase, anthropic;
  try {
    supabase = getSupabase();
    anthropic = getAnthropicClient();
  } catch (err) {
    const msg = `⚠️ Integration check crashed at startup (${today}): ${err.message}`;
    console.error('[IntegCheck]', msg);
    await sendAlertMessage(msg);
    process.exit(1);
  }

  // Step 0: Sync-before-compare
  // Run schedule sync + drain detail queue so any bookings made since the midnight
  // cron are in the DB before we compare. Non-fatal — if sync fails for any reason
  // (session expired, network error, missing credentials), we log and continue.
  // The check will run against whatever is currently in the DB.
  //
  // runDetailSync is called with runResetStuck:false after the first iteration —
  // resetStuck is called once manually to avoid redundant DB queries in the loop.
  console.log('[IntegCheck] Step 0: running sync-before-compare');
  try {
    const scheduleResult = await runScheduleSync(supabase);
    console.log(
      '[IntegCheck] Step 0 schedule: action=%s pagesScanned=%d queued=%d queueDepth=%d',
      scheduleResult.action,
      scheduleResult.pagesScanned,
      scheduleResult.queued,
      scheduleResult.queueDepth,
    );

    if (scheduleResult.action === 'ok' || scheduleResult.action === 'session_cleared') {
      // Drain the detail queue. Reset stuck items once before the loop, then skip
      // on subsequent iterations to avoid 20 redundant DB queries (Gap 3 fix).
      const MAX_DETAIL_ITERATIONS = 20;
      await resetStuck(supabase);
      let drained = 0;
      for (let i = 0; i < MAX_DETAIL_ITERATIONS; i++) {
        const detailResult = await runDetailSync(supabase, { runResetStuck: false });
        console.log(
          '[IntegCheck] Step 0 detail [%d/%d]: action=%s queueDepth=%d',
          i + 1,
          MAX_DETAIL_ITERATIONS,
          detailResult.action,
          detailResult.queueDepth ?? 0,
        );
        drained++;
        if (detailResult.action === 'idle' || detailResult.action === 'session_cleared' || detailResult.action === 'session_failed') {
          break;
        }
        if (i === MAX_DETAIL_ITERATIONS - 1) {
          console.warn('[IntegCheck] ⚠️ Step 0 detail: hit %d-iteration cap without reaching idle — queue may still have items', MAX_DETAIL_ITERATIONS);
        }
      }
      console.log('[IntegCheck] Step 0 done: %d detail iteration(s)', drained);
    }
  } catch (step0Err) {
    console.error('[IntegCheck] Step 0 error (continuing to check): %s', step0Err.message);
  }

  // Step 1: Session
  const cookieString = await loadSession(supabase);
  if (!cookieString) {
    const msg = `⚠️ Integration check skipped (${today})\nNo valid session cached. Run cron-auth first.`;
    console.log('[IntegCheck]', msg);
    await sendAlertMessage(msg, supabase);
    process.exit(0);
  }

  // Step 2: Playwright
  let screenshot, boardingAppointments, daytimeAppointments;
  try {
    ({ screenshot, boardingAppointments, daytimeAppointments } = await scrapeWithPlaywright(cookieString));
  } catch (err) {
    const msg = `⚠️ Integration check failed (${today})\nPlaywright error: ${err.message}`;
    console.error('[IntegCheck]', msg);
    await sendAlertMessage(msg, supabase);
    process.exit(1);
  }

  // Step 3: Claude vision (non-fatal — continue without it if API is down)
  let claudeNames = [];
  try {
    claudeNames = await extractNamesFromScreenshot(anthropic, screenshot);
  } catch (err) {
    console.error('[IntegCheck] Claude vision failed (skipping name check): %s', err.message);
  }

  // Step 4: DB — boarding + daytime in parallel
  const [dbBoardings, dbDaytime] = await Promise.all([
    queryDbBoardings(supabase),
    queryDbDaytimeAppointments(supabase),
  ]);

  // Step 5: Compare
  const { passed: boardingPassed, issues: boardingIssues } = compareResults(boardingAppointments, claudeNames, dbBoardings);
  const { passed: daytimePassed, issues: daytimeIssues, domCount, dbCount } = compareDaytimeResults(daytimeAppointments, dbDaytime);
  const passed = boardingPassed && daytimePassed;
  const allIssues = [...boardingIssues, ...daytimeIssues];

  // Step 6: Report
  const bn = dbBoardings.length;
  let message;
  if (passed) {
    message = [
      `✅ Integration check passed (${today})`,
      `Boarding: ${bn} in DB — all match schedule`,
      `Daytime today: ${domCount} on schedule, ${dbCount} in DB — all good`,
    ].join('\n');
  } else {
    const lines = [`⚠️ Integration check found issues (${today})`];
    if (boardingIssues.length > 0) {
      lines.push('Boarding:', ...boardingIssues.map(i => `• ${i}`));
    }
    if (daytimeIssues.length > 0) {
      lines.push('Daytime:', ...daytimeIssues.map(i => `• ${i}`));
    }
    message = lines.join('\n');
  }

  console.log('[IntegCheck] === Final report ===\n%s', message);
  if (alwaysSend || !passed) {
    await sendAlertMessage(message, supabase);
  } else {
    console.log('[IntegCheck] Run 2/3 — check passed, suppressing WhatsApp (no news is good news)');
  }

  console.log('[IntegCheck] === Done === (%d issue(s))', allIssues.length);
  process.exit(0); // job succeeded — data issues are content of the report, not a job failure
}

main().catch(err => {
  console.error('[IntegCheck] Unhandled error:', err.message, err.stack);
  process.exit(1);
});
