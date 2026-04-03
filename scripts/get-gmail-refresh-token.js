/* global process */
/**
 * One-time script: generate a new GMAIL_REFRESH_TOKEN via OAuth2 browser flow.
 *
 * Run this locally whenever the refresh token is revoked (e.g. Google account
 * password change, new country login, manual revocation in Google Account settings).
 *
 * Prerequisites:
 *   - GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be passed as env vars.
 *     Get them from GitHub → Settings → Secrets, or from your Google Cloud Console
 *     (APIs & Services → Credentials → your OAuth 2.0 Client ID).
 *   - http://localhost:3333/callback must be registered as an authorized redirect URI
 *     in Google Cloud Console for your OAuth client. If not, add it and save before running.
 *
 * Usage:
 *   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/get-gmail-refresh-token.js
 *
 * What it does:
 *   1. Starts a local HTTP server on port 3333 to catch the OAuth callback
 *   2. Opens your browser to the Google consent page
 *   3. After you approve, catches the authorization code from the redirect
 *   4. Exchanges the code for tokens and prints the refresh token
 *   5. Prints the exact `gh secret set` command to update the GH secret
 */

import http from 'http';
import { exec } from 'child_process';

const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify', // needed to mark emails as read
].join(' ');

// ---------------------------------------------------------------------------
// Validate env
// ---------------------------------------------------------------------------

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n[Error] Missing required env vars.');
  console.error('Run with:');
  console.error('  GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/get-gmail-refresh-token.js\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build authorization URL
// ---------------------------------------------------------------------------

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');   // required for refresh token
authUrl.searchParams.set('prompt', 'consent');         // forces new refresh token even if previously authorized

// ---------------------------------------------------------------------------
// Exchange auth code for tokens
// ---------------------------------------------------------------------------

async function exchangeCode(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${JSON.stringify(data)}`);
  }

  if (!data.refresh_token) {
    throw new Error(
      'No refresh_token in response. ' +
      'This can happen if the account already has an active grant and "prompt=consent" was ignored. ' +
      'Try revoking access at https://myaccount.google.com/permissions and run this script again.',
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// Open browser (macOS)
// ---------------------------------------------------------------------------

function openBrowser(url) {
  exec(`open "${url}"`, (err) => {
    if (err) {
      console.log('\n[Note] Could not open browser automatically. Open this URL manually:');
      console.log(url);
    }
  });
}

// ---------------------------------------------------------------------------
// Local callback server
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Gmail OAuth2 Token Generator ===\n');
  console.log('Redirect URI this script uses:');
  console.log(' ', REDIRECT_URI);
  console.log('\nIMPORTANT: This URI must be registered in Google Cloud Console');
  console.log('  → APIs & Services → Credentials → your OAuth client → Authorized redirect URIs');
  console.log('  If it is not there, add it now and save before continuing.\n');

  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authorization failed: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`Authorization denied: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h2>Missing authorization code</h2><p>You can close this tab.</p>');
        server.close();
        reject(new Error('No authorization code in callback'));
        return;
      }

      // Exchange code for tokens
      let tokens;
      try {
        tokens = await exchangeCode(code);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h2>Token exchange failed</h2><pre>${err.message}</pre><p>You can close this tab.</p>`);
        server.close();
        reject(err);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Success!</h2><p>Refresh token captured. You can close this tab and check your terminal.</p>');
      server.close();

      // Print results
      console.log('\n✅ SUCCESS — new refresh token captured:\n');
      console.log('GMAIL_REFRESH_TOKEN=');
      console.log(tokens.refresh_token);
      console.log('\n--- Update the GitHub secret ---');
      console.log('Run this command (replace the token value):');
      console.log(`\n  /usr/local/bin/gh secret set GMAIL_REFRESH_TOKEN --body="${tokens.refresh_token}" --repo kcoffie/dog-boarding\n`);
      console.log('Then verify by manually triggering the Gmail Monitor workflow:');
      console.log('  /usr/local/bin/gh workflow run gmail-monitor.yml --repo kcoffie/dog-boarding\n');

      resolve();
    });

    server.listen(PORT, () => {
      console.log(`Listening for OAuth callback on port ${PORT}...`);
      console.log('Opening browser to Google consent page...\n');
      openBrowser(authUrl.toString());
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} is already in use. Kill the process using it and try again.`));
      } else {
        reject(err);
      }
    });
  });
}

main().catch((err) => {
  console.error('\n[Error]', err.message);
  process.exit(1);
});
