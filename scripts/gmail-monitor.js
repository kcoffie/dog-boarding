/* global process */
/**
 * Gmail monitor — watches kcoffie@gmail.com for infrastructure failure emails.
 *
 * Runs hourly via GitHub Actions. For each unread email from a known sender
 * that matches a subject pattern:
 *   1. Checks gmail_processed_emails to skip already-processed emails
 *   2. Sends a WhatsApp alert to INTEGRATION_CHECK_RECIPIENTS via Meta Cloud API
 *   3. Records the email in gmail_processed_emails to prevent duplicates
 *
 * Authentication: uses OAuth2 with a long-lived refresh token (GMAIL_REFRESH_TOKEN).
 * The refresh token is exchanged for a short-lived access token on each run.
 * No googleapis SDK — raw fetch to the Gmail REST API.
 *
 * Known senders and subject filters:
 *   - notifications@github.com    + subject matches "run failed" / "jobs failed"
 *   - notifications@vercel.com    + subject matches "Failed"
 *   - *@supabase.com (domain)     + any subject
 *
 * Required env vars (GitHub Actions Repository secrets):
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *   META_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN
 *   INTEGRATION_CHECK_RECIPIENTS
 *
 * Optional:
 *   ANTHROPIC_API_KEY — if set (and has credits), Claude summarizes the email body.
 *                       Falls back to subject line if not set or API fails.
 */

import { createClient } from '@supabase/supabase-js';
import { sendTextMessage, getAlertRecipients } from '../src/lib/notifyWhatsApp.js';

// ---------------------------------------------------------------------------
// Known sender configuration
// ---------------------------------------------------------------------------

// Subjects that should never trigger an alert — prevents infinite alert loops.
// If the Gmail Monitor workflow itself fails, GitHub sends an email that would
// match the GitHub Actions sender filter. SELF_SKIP_SUBJECTS catches it first.
export const SELF_SKIP_SUBJECTS = [/gmail[- ]monitor/i];

const KNOWN_SENDERS = [
  {
    from: 'notifications@github.com',
    name: 'GitHub Actions',
    subjectPatterns: [
      /run failed/i,
      /some jobs were not successful/i,
      /all jobs have failed/i,
    ],
  },
  {
    from: 'notifications@vercel.com',
    name: 'Vercel',
    subjectPatterns: [/failed/i],
  },
  {
    fromDomain: 'supabase.com',
    name: 'Supabase',
    subjectPatterns: [/.*/], // any Supabase email is notable
  },
];

// Gmail search query — cast a wide net by sender, then filter by subject in code.
// Using 'is:unread' ensures we only process new emails each run.
const GMAIL_QUERY = [
  'from:(notifications@github.com OR notifications@vercel.com)',
  'OR from:(@supabase.com)',
  'is:unread',
].join(' ');

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// OAuth2 — refresh token → access token
// ---------------------------------------------------------------------------

/**
 * Parse a Google OAuth2 error response and classify it.
 *
 * Returns `{ type: 'invalid_grant', description }` when Google reports the
 * refresh token is revoked or expired — a known, recoverable state that
 * should NOT cause a workflow failure alert.
 *
 * Returns `{ type: 'generic', description }` for all other error shapes
 * (bad credentials, network errors, unexpected status codes, etc.).
 *
 * Pure function — exported for testing without fetch mocks.
 *
 * @param {number} status - HTTP status code from the token endpoint
 * @param {object|null} body - Parsed JSON response body, or null if parsing failed
 * @returns {{ type: 'invalid_grant'|'generic', description: string }}
 */
export function detectOAuthError(status, body) {
  if (status === 400 && body?.error === 'invalid_grant') {
    const description = body.error_description
      ? `${body.error_description}`
      : 'refresh token revoked or expired';
    return { type: 'invalid_grant', description };
  }

  const errorLabel = body?.error ? ` (${body.error})` : '';
  return {
    type: 'generic',
    description: `OAuth2 token refresh failed (${status})${errorLabel}`,
  };
}

/**
 * Exchange the long-lived refresh token for a short-lived Gmail access token.
 * Called once per script run.
 *
 * Throws an error tagged with `err.code = 'GMAIL_INVALID_GRANT'` if Google
 * reports the refresh token is revoked — so the caller can exit gracefully
 * rather than treating this as an unexpected infrastructure failure.
 *
 * @returns {Promise<string>} access token
 */
async function getAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Gmail OAuth2 env vars (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const { type, description } = detectOAuthError(response.status, body);

    if (type === 'invalid_grant') {
      const err = new Error(`Gmail OAuth token revoked (invalid_grant): ${description}`);
      err.code = 'GMAIL_INVALID_GRANT';
      throw err;
    }

    // Generic OAuth failure — log raw body for debugging
    const rawBody = body ? JSON.stringify(body) : '(unparseable response)';
    throw new Error(`${description}: ${rawBody}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('OAuth2 response missing access_token');
  }

  console.log('[GmailMonitor] OAuth2 token obtained (expires in %ds)', data.expires_in);
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Gmail API
// ---------------------------------------------------------------------------

/**
 * Search Gmail for unread emails from known infrastructure senders.
 * Returns a list of message IDs.
 *
 * @param {string} accessToken
 * @returns {Promise<string[]>} - List of message IDs
 */
async function searchGmail(accessToken) {
  const params = new URLSearchParams({ q: GMAIL_QUERY, maxResults: '20' });
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`Gmail search failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const ids = (data.messages || []).map(m => m.id);
  console.log('[GmailMonitor] Gmail search returned %d message(s)', ids.length);
  return ids;
}

/**
 * Fetch the full message metadata (headers) for a given Gmail message ID.
 * We only need From, Subject — no need to fetch the full body for filtering.
 *
 * @param {string} accessToken
 * @param {string} messageId
 * @returns {Promise<{ id: string, from: string, subject: string, snippet: string }>}
 */
async function fetchMessage(accessToken, messageId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`Gmail fetch message ${messageId} failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const headers = data.payload?.headers || [];
  const from = headers.find(h => h.name === 'From')?.value || '';
  const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';

  return {
    id: messageId,
    from,
    subject,
    snippet: data.snippet || '',
  };
}

// ---------------------------------------------------------------------------
// Sender matching
// ---------------------------------------------------------------------------

/**
 * Check if an email's from address matches a known sender config entry.
 *
 * @param {string} from - Raw From header value (may include display name)
 * @param {{ from?: string, fromDomain?: string }} config
 * @returns {boolean}
 */
function matchesSender(from, config) {
  const fromLower = from.toLowerCase();
  if (config.from) {
    return fromLower.includes(config.from.toLowerCase());
  }
  if (config.fromDomain) {
    return fromLower.includes(`@${config.fromDomain.toLowerCase()}`);
  }
  return false;
}

/**
 * Find the matching sender config for an email, and check if its subject
 * matches any of the configured subject patterns.
 *
 * Self-skip check runs first: if the subject matches SELF_SKIP_SUBJECTS,
 * the email is silently skipped regardless of sender to prevent alert loops.
 *
 * @param {{ from: string, subject: string }} email
 * @returns {{ senderConfig: object|null, matched: boolean }}
 */
export function classifyEmail(email) {
  const subject = email.subject || '';

  // Self-skip: suppress alerts about the Gmail Monitor workflow itself
  if (SELF_SKIP_SUBJECTS.some(re => re.test(subject))) {
    console.log('[GmailMonitor] Self-skip: subject "%s" matches SELF_SKIP_SUBJECTS', subject);
    return { senderConfig: null, matched: false };
  }

  for (const config of KNOWN_SENDERS) {
    if (!matchesSender(email.from, config)) continue;

    const subjectMatches = config.subjectPatterns.some(re => re.test(email.subject));
    if (subjectMatches) {
      return { senderConfig: config, matched: true };
    }

    // Sender matched but subject didn't — skip (e.g. GitHub PR comment)
    console.log(
      '[GmailMonitor] Skipping %s from %s — subject "%s" did not match filters',
      email.id,
      config.name,
      email.subject,
    );
    return { senderConfig: config, matched: false };
  }

  // No sender config matched (shouldn't happen since Gmail query filters by sender)
  return { senderConfig: null, matched: false };
}

// ---------------------------------------------------------------------------
// Supabase dedup
// ---------------------------------------------------------------------------

/**
 * Check if an email has already been processed.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} emailId
 * @returns {Promise<boolean>}
 */
async function isAlreadyProcessed(supabase, emailId) {
  const { data, error } = await supabase
    .from('gmail_processed_emails')
    .select('email_id')
    .eq('email_id', emailId)
    .maybeSingle();

  if (error) {
    console.warn('[GmailMonitor] Could not check processed status for %s: %s', emailId, error.message);
    return false; // Fail open: process it anyway to avoid missing alerts
  }

  return !!data;
}

/**
 * Mark an email as processed in Supabase.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ id: string, from: string, subject: string }} email
 */
async function markProcessed(supabase, email) {
  const { error } = await supabase
    .from('gmail_processed_emails')
    .insert({
      email_id: email.id,
      sender: email.from,
      subject: email.subject,
      alert_sent: true,
    });

  if (error) {
    console.warn('[GmailMonitor] Could not mark %s as processed: %s', email.id, error.message);
  }
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

async function sendAlertMessage(message) {
  const recipients = getAlertRecipients();
  const results = await sendTextMessage(message, recipients);
  const sent = results.filter(r => r.status === 'sent').length;
  console.log('[GmailMonitor] WhatsApp: %d/%d sent', sent, recipients.length);
}

/**
 * Build the WhatsApp alert message for a matched email.
 * Optionally uses Claude for a 1-line summary if ANTHROPIC_API_KEY is set.
 *
 * Falls back to subject line if Claude is unavailable or has no credits.
 *
 * @param {{ id: string, from: string, subject: string, snippet: string }} email
 * @param {{ name: string }} senderConfig
 * @returns {Promise<string>}
 */
async function buildAlertMessage(email, senderConfig) {
  let summary = email.subject;

  // Optional: Claude summary (non-blocking)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && email.snippet) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `Summarize this infrastructure alert in one sentence (max 15 words):\nSubject: ${email.subject}\nSnippet: ${email.snippet}`,
          }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const claudeSummary = data?.content?.[0]?.text?.trim();
        if (claudeSummary) summary = claudeSummary;
      }
    } catch (err) {
      console.warn('[GmailMonitor] Claude summary failed (using subject): %s', err.message);
    }
  }

  return [
    `⚠️ Infrastructure Alert`,
    `From: ${senderConfig.name}`,
    `Subject: ${email.subject}`,
    summary !== email.subject ? `Summary: ${summary}` : null,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[GmailMonitor] === Gmail monitor starting ===');

  const supabase = getSupabase();

  // Step 1: Get Gmail access token
  const accessToken = await getAccessToken();

  // Step 2: Search for unread emails from known senders
  const messageIds = await searchGmail(accessToken);

  if (messageIds.length === 0) {
    console.log('[GmailMonitor] No unread emails from known senders — done');
    process.exit(0);
  }

  // Step 3: Process each message
  let alertsSent = 0;
  let skipped = 0;

  for (const id of messageIds) {
    let email;
    try {
      email = await fetchMessage(accessToken, id);
    } catch (err) {
      console.error('[GmailMonitor] Could not fetch message %s: %s', id, err.message);
      continue;
    }

    console.log('[GmailMonitor] Processing: %s | From: %s | Subject: %s', id, email.from, email.subject);

    // Classify — check sender + subject patterns
    const { senderConfig, matched } = classifyEmail(email);
    if (!matched) {
      skipped++;
      continue;
    }

    // Dedup check
    const alreadyDone = await isAlreadyProcessed(supabase, id);
    if (alreadyDone) {
      console.log('[GmailMonitor] Already processed %s — skipping', id);
      skipped++;
      continue;
    }

    // Build and send alert
    const message = await buildAlertMessage(email, senderConfig);
    console.log('[GmailMonitor] Sending alert for %s:\n%s', id, message);
    await sendAlertMessage(message);

    // Mark processed
    await markProcessed(supabase, email);
    alertsSent++;
  }

  console.log('[GmailMonitor] === Done === (%d alert(s) sent, %d skipped)', alertsSent, skipped);
  process.exit(0);
}

// Only run main() when executed directly — not when imported by tests.
if (process.argv[1]?.endsWith('gmail-monitor.js')) {
  main().catch(err => {
    if (err.code === 'GMAIL_INVALID_GRANT') {
      // Known recoverable state — token revoked (e.g. new country login, password change).
      // Exit 0 so the workflow does not fail and generate its own "run failed" alert email.
      console.log('[GmailMonitor] Gmail OAuth token is revoked — monitoring paused until re-authenticated.');
      console.log('[GmailMonitor] To fix: GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npm run reauth-gmail');
      console.log('[GmailMonitor] Then update GMAIL_REFRESH_TOKEN in GitHub repo secrets.');
      console.log('[GmailMonitor] Details:', err.message);
      process.exit(0);
    }
    console.error('[GmailMonitor] Unhandled error:', err.message, err.stack);
    process.exit(1);
  });
}
