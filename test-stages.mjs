/**
 * Staged verification test script
 * Run with: node test-stages.mjs
 */

const PORT = 5173;

async function postJson(path, data) {
  const body = JSON.stringify(data);
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body,
  });
  return res.json();
}

async function runTest() {
  console.log('=== STAGE 1: AUTH ===');
  const authResult = await postJson('/api/sync-proxy', {
    action: 'authenticate',
    username: 'admin@agirlandyourdog.com',
    password: 'daisylovesdogs3247'
  });
  console.log('Auth success:', authResult.success);
  console.log('Cookies length:', (authResult.cookies || '').length);

  if (!authResult.success) {
    console.log('Auth failed:', authResult.error);
    return;
  }

  console.log('');
  console.log('=== STAGE 2: FETCH SCHEDULE ===');
  const fetchResult = await postJson('/api/sync-proxy', {
    action: 'fetch',
    url: 'https://agirlandyourdog.com/schedule',
    cookies: authResult.cookies,
    method: 'GET'
  });

  console.log('Fetch success:', fetchResult.success);
  console.log('Fetch status:', fetchResult.status);

  const html = fetchResult.html || '';
  console.log('HTML length:', html.length);

  console.log('');
  console.log('=== ANALYSIS ===');
  const hasLoginForm = html.includes('name="passwd"') || html.includes('form_login');
  const pageTitle = (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || 'N/A';
  const hasFullCalendar = html.includes('fullcalendar') || html.includes('FullCalendar');
  const hasFcEvent = html.includes('fc-event') || html.includes('fc-view');
  const scheduleLinks = (html.match(/\/schedule\/a\/[^"\/]+/g) || []).length;

  console.log('Has login form:', hasLoginForm);
  console.log('Page title:', pageTitle);
  console.log('Has FullCalendar:', hasFullCalendar);
  console.log('Has fc-event/fc-view:', hasFcEvent);
  console.log('Schedule links found:', scheduleLinks);

  // Check for false positive issue
  const wouldFalsePositive = html.includes('login') && html.includes('password');
  console.log('Would trigger false positive (login+password words):', wouldFalsePositive);

  console.log('');
  if (hasLoginForm) {
    console.log('❌ RESULT: Got LOGIN page - cookies not working');
  } else if (hasFullCalendar || hasFcEvent || scheduleLinks > 0) {
    console.log('✅ RESULT: Got SCHEDULE page - cookies working!');
    if (wouldFalsePositive) {
      console.log('⚠️  WARNING: schedule.js session check would FALSE POSITIVE');
      console.log('   Needs fix before running full sync');
    }
  } else {
    console.log('⚠️ UNKNOWN page type');
    console.log('HTML snippet:', html.substring(0, 800));
  }
}

runTest().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
