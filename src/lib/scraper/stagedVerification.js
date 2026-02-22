/**
 * Staged Verification Script
 * Tests auth and sync in small, verifiable chunks
 *
 * Usage in browser console:
 *   import('/src/lib/scraper/stagedVerification.js').then(m => m.runStage1())
 *   import('/src/lib/scraper/stagedVerification.js').then(m => m.runStage2())
 */

import { authenticate, authenticatedFetch, clearSession, isAuthenticated } from './auth.js';
import { syncLogger } from './logger.js';

const log = syncLogger.log;
const error = syncLogger.error;

/**
 * Stage 1: Verify authentication works (302 redirect)
 * Watch terminal for [API Proxy] logs
 */
export async function runStage1() {
  log('═══════════════════════════════════════════════════════════════');
  log('STAGE 1: VERIFY AUTHENTICATION');
  log('═══════════════════════════════════════════════════════════════');
  log('Watch terminal for [API Proxy] logs showing:');
  log('  - AUTH - Login response status: 302 (SUCCESS)');
  log('  - NOT status: 200 (that means login page returned = FAILURE)');
  log('───────────────────────────────────────────────────────────────');

  // Clear any existing session
  clearSession();
  log('[Stage1] Cleared existing session');

  // Get credentials from env
  const username = import.meta.env.VITE_EXTERNAL_SITE_USERNAME;
  const password = import.meta.env.VITE_EXTERNAL_SITE_PASSWORD;

  if (!username || !password) {
    error('[Stage1] ❌ FAILED: Missing credentials in .env.local');
    error('[Stage1] Set VITE_EXTERNAL_SITE_USERNAME and VITE_EXTERNAL_SITE_PASSWORD');
    return { success: false, error: 'Missing credentials' };
  }

  log(`[Stage1] Authenticating with username: ${username.substring(0, 3)}***`);

  const startTime = Date.now();
  const result = await authenticate(username, password);
  const duration = Date.now() - startTime;

  log('───────────────────────────────────────────────────────────────');
  if (result.success) {
    log(`[Stage1] ✅ AUTH SUCCESS (${duration}ms)`);
    log(`[Stage1] Cookies received: ${result.cookies ? 'yes' : 'no'}`);
    log(`[Stage1] isAuthenticated(): ${isAuthenticated()}`);
    log('');
    log('▶ NEXT: Check terminal for "Login response status: 302"');
    log('▶ NEXT: If 302, proceed to Stage 2: runStage2()');
  } else {
    error(`[Stage1] ❌ AUTH FAILED (${duration}ms): ${result.error}`);
    error('');
    error('▶ Check terminal for [API Proxy] logs to diagnose');
  }
  log('═══════════════════════════════════════════════════════════════');

  return result;
}

/**
 * Stage 2: Verify schedule fetch returns schedule HTML (not login page)
 * Must run Stage 1 first
 */
export async function runStage2() {
  log('═══════════════════════════════════════════════════════════════');
  log('STAGE 2: VERIFY SCHEDULE FETCH');
  log('═══════════════════════════════════════════════════════════════');

  if (!isAuthenticated()) {
    error('[Stage2] ❌ Not authenticated. Run runStage1() first.');
    return { success: false, error: 'Not authenticated' };
  }

  log('[Stage2] Session is authenticated, fetching schedule...');

  const scheduleUrl = 'https://agirlandyourdog.com/schedule';
  log(`[Stage2] Fetching: ${scheduleUrl}`);

  const startTime = Date.now();
  let response;
  try {
    response = await authenticatedFetch(scheduleUrl);
  } catch (fetchError) {
    error(`[Stage2] ❌ Fetch error: ${fetchError.message}`);
    return { success: false, error: fetchError.message };
  }
  const duration = Date.now() - startTime;

  log(`[Stage2] Response ok: ${response.ok}, status: ${response.status} (${duration}ms)`);

  const html = await response.text();
  log(`[Stage2] HTML length: ${html.length} chars`);

  // Analyze the HTML content
  log('───────────────────────────────────────────────────────────────');
  log('[Stage2] ANALYZING HTML CONTENT:');

  const analysis = {
    hasLoginForm: html.includes('name="passwd"') || html.includes('form_login'),
    hasLoginWord: html.includes('login'),
    hasPasswordWord: html.includes('password'),
    hasFullCalendar: html.includes('fullcalendar') || html.includes('FullCalendar'),
    hasFcEvent: html.includes('fc-event'),
    hasScheduleLinks: (html.match(/\/schedule\/a\/[^"]+/g) || []).length,
    titleMatch: html.match(/<title>([^<]+)<\/title>/i),
  };

  log(`[Stage2]   - Has login form fields: ${analysis.hasLoginForm}`);
  log(`[Stage2]   - Contains word "login": ${analysis.hasLoginWord}`);
  log(`[Stage2]   - Contains word "password": ${analysis.hasPasswordWord}`);
  log(`[Stage2]   - Has FullCalendar: ${analysis.hasFullCalendar}`);
  log(`[Stage2]   - Has fc-event classes: ${analysis.hasFcEvent}`);
  log(`[Stage2]   - Schedule links found: ${analysis.hasScheduleLinks}`);
  log(`[Stage2]   - Page title: ${analysis.titleMatch ? analysis.titleMatch[1] : '(not found)'}`);

  // Determine if this is a login page or schedule page
  const isLoginPage = analysis.hasLoginForm;
  const isSchedulePage = analysis.hasFullCalendar || analysis.hasFcEvent || analysis.hasScheduleLinks > 0;

  log('───────────────────────────────────────────────────────────────');
  if (isLoginPage) {
    error('[Stage2] ❌ GOT LOGIN PAGE - Session not working');
    error('[Stage2] The cookies are not being accepted by the server');
    log('');
    log('▶ HTML Preview (first 500 chars):');
    log(html.substring(0, 500));
    return { success: false, error: 'Got login page instead of schedule', analysis, html };
  }

  if (isSchedulePage) {
    log('[Stage2] ✅ GOT SCHEDULE PAGE');
    log(`[Stage2] Found ${analysis.hasScheduleLinks} appointment links`);

    // Check if the current session check in schedule.js would false-positive
    const wouldFalsePositive = analysis.hasLoginWord && analysis.hasPasswordWord;
    if (wouldFalsePositive) {
      log('');
      log('[Stage2] ⚠️  WARNING: Current session check would FALSE POSITIVE');
      log('[Stage2] schedule.js:116-118 checks for "login" AND "password" in HTML');
      log('[Stage2] This valid schedule page contains both words!');
      log('[Stage2] ▶ NEXT: Run Stage 3 to fix the session check');
    } else {
      log('');
      log('[Stage2] ✓ Current session check would NOT false positive');
      log('[Stage2] ▶ NEXT: Proceed to Stage 4 (full sync test)');
    }

    return { success: true, analysis, htmlLength: html.length, html };
  }

  // Unknown page type
  log('[Stage2] ⚠️  UNKNOWN PAGE TYPE - neither login nor schedule detected');
  log('');
  log('▶ HTML Preview (first 1000 chars):');
  log(html.substring(0, 1000));
  return { success: false, error: 'Unknown page type', analysis, html };
}

/**
 * Run both stages in sequence
 */
export async function runAllStages() {
  const stage1 = await runStage1();
  if (!stage1.success) {
    return { stage1, stage2: null };
  }

  // Small delay between stages
  await new Promise(r => setTimeout(r, 1000));

  const stage2 = await runStage2();
  return { stage1, stage2 };
}

export default {
  runStage1,
  runStage2,
  runAllStages,
};
