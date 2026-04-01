/**
 * WhatsApp notification wrapper — sends messages via Meta Cloud API.
 *
 * Design: thin wrapper around the Meta Graph API. All Meta-specific error
 * handling is isolated here so callers (api/notify.js) work with a simple
 * { status, messageId } contract. No business logic lives here.
 *
 * Meta WhatsApp Cloud API requires:
 *   META_PHONE_NUMBER_ID — the sender number ID from the Meta app dashboard
 *   META_WHATSAPP_TOKEN  — permanent system user access token
 *
 * Recipients: E.164 format without 'whatsapp:' prefix (Meta uses plain numbers).
 * Security: recipient numbers are masked to last 4 digits in all log output.
 *
 * @requirements REQ-v4.1, REQ-v5.0-M0
 */

import { createSyncLogger } from './scraper/logger.js';

const logger = createSyncLogger('NotifyWA');
const log = logger.log;
const logWarn = logger.warn;

const META_API_VERSION = 'v18.0';

// Template names — must match approved templates in Meta Business Manager.
// Override via env vars if template names differ from defaults.
const ALERT_TEMPLATE = process.env.META_ALERT_TEMPLATE || 'dog_boarding_alert';
const ROSTER_TEMPLATE = process.env.META_ROSTER_TEMPLATE || 'dog_boarding_roster';
const TEMPLATE_LANG = 'en';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mask a phone number for safe logging — shows only last 4 digits.
 * Input: "+18312477375"  Output: "***-***-7375"
 *
 * @param {string} number
 * @returns {string}
 */
function maskNumber(number) {
  const digits = number.replace(/\D/g, '');
  return `***-***-${digits.slice(-4)}`;
}

/**
 * Parse the NOTIFY_RECIPIENTS env var into an array of E.164 phone numbers.
 * Expected format: "+18312477375" or "+18312477375,+14085551234"
 *
 * Error-handling: returns empty array if env var is unset or blank.
 * Each number is trimmed; empty strings are filtered out.
 *
 * @returns {string[]}
 */
export function getRecipients() {
  const raw = process.env.NOTIFY_RECIPIENTS || '';
  return raw.split(',').map(n => n.trim()).filter(Boolean);
}

/**
 * Parse the INTEGRATION_CHECK_RECIPIENTS env var into an array of E.164 phone numbers.
 * Used by alert scripts (integration-check, cron-health-check, gmail-monitor).
 *
 * @returns {string[]}
 */
export function getAlertRecipients() {
  const raw = process.env.INTEGRATION_CHECK_RECIPIENTS || '';
  return raw.split(',').map(n => n.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Meta Cloud API
// ---------------------------------------------------------------------------

/**
 * Build a Meta template message payload.
 * Components describe the variable parts of the template (header, body, etc.).
 *
 * @param {string} templateName
 * @param {object[]} components
 * @returns {{ type: 'template', template: object }}
 */
function buildTemplatePayload(templateName, components) {
  return {
    type: 'template',
    template: {
      name: templateName,
      language: { code: TEMPLATE_LANG },
      components,
    },
  };
}


/**
 * Read Meta credentials from environment.
 * Returns null if either var is missing — callers handle the missing-config case.
 *
 * @returns {{ phoneNumberId: string, token: string }|null}
 */
function getMetaCredentials() {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) return null;
  return { phoneNumberId, token };
}

/**
 * POST a single message to the Meta Cloud API.
 *
 * @param {string} phoneNumberId - Sender phone number ID
 * @param {string} token         - System user access token
 * @param {string} to            - Recipient E.164 number
 * @param {object} messagePayload - { type, image|text } object
 * @returns {Promise<{ messageId: string }>}
 * @throws on non-2xx HTTP response
 */
async function metaApiSend(phoneNumberId, token, to, messagePayload) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    ...messagePayload,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`Meta API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  // Meta returns: { messages: [{ id: "wamid.xxx" }] }
  return { messageId: data?.messages?.[0]?.id ?? 'unknown' };
}

// ---------------------------------------------------------------------------
// Send functions
// ---------------------------------------------------------------------------

/**
 * Upload a PNG image to the Meta media API and return the media ID.
 *
 * Meta silently fails to deliver when it cannot fetch an image URL from an
 * external host (known behavior with Vercel endpoints). Uploading directly
 * gives us a stable media_id served from Meta's own CDN, eliminating that
 * dependency entirely.
 *
 * @param {string} phoneNumberId - Sender phone number ID
 * @param {string} token         - System user access token
 * @param {string} imageUrl      - URL to fetch the PNG from
 * @returns {Promise<string>}    - Meta media ID
 * @throws if image fetch or media upload fails
 */
async function metaMediaUpload(phoneNumberId, token, imageUrl) {
  // Step 1: Fetch the PNG buffer
  log(`[metaMediaUpload] Fetching image from ${new URL(imageUrl).hostname}...`);
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`[metaMediaUpload] Image fetch failed: HTTP ${imageRes.status} from ${imageUrl}`);
  }
  const buffer = await imageRes.arrayBuffer();
  log(`[metaMediaUpload] Image fetched — ${buffer.byteLength} bytes`);

  // Step 2: Upload to Meta media API as multipart/form-data
  // Do not set Content-Type manually — fetch sets it automatically with the correct boundary.
  const uploadUrl = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/media`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'image/png');
  form.append('file', new Blob([buffer], { type: 'image/png' }), 'roster.png');

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '(no body)');
    throw new Error(`[metaMediaUpload] Upload failed: HTTP ${uploadRes.status}: ${text}`);
  }

  const data = await uploadRes.json();
  const mediaId = data?.id;
  if (!mediaId) {
    throw new Error(`[metaMediaUpload] Upload response missing id: ${JSON.stringify(data)}`);
  }

  log(`[metaMediaUpload] Upload complete — media_id: ${mediaId}`);
  return mediaId;
}

/**
 * Send the roster image to one or more WhatsApp numbers via Meta Cloud API.
 *
 * Uploads the PNG to Meta's media API first (one upload for all recipients),
 * then sends the template with { image: { id } } instead of { image: { link } }.
 * This avoids Meta's silent URL-fetch failures against Vercel endpoints.
 *
 * Iterates recipients sequentially (not parallel) to stay within Meta's rate
 * limits. Each recipient gets its own try/catch so a single bad number doesn't
 * block the rest of the list.
 *
 * @param {string} imageUrl     - URL to fetch the roster PNG from
 * @param {string[]} recipients - E.164 phone numbers
 * @returns {Promise<Array<{to, status, messageId?, error?}>>}
 * @throws if the media upload step fails (pre-send; affects all recipients)
 */
export async function sendRosterImage(imageUrl, recipients) {
  log(`sendRosterImage — ${recipients.length} recipients, imageUrl host: ${new URL(imageUrl).hostname}`);

  if (recipients.length === 0) {
    logWarn('No recipients configured — skipping send');
    return [];
  }

  const creds = getMetaCredentials();
  if (!creds) {
    logWarn('Meta API credentials not configured (META_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN)');
    return recipients.map(to => ({
      to: maskNumber(to),
      status: 'failed',
      error: 'Meta API credentials not configured',
    }));
  }

  // Upload once — reuse the same media_id for every recipient.
  // Throws on failure so the caller knows the send did not proceed.
  const mediaId = await metaMediaUpload(creds.phoneNumberId, creds.token, imageUrl);
  log(`sendRosterImage — using media_id: ${mediaId} for ${recipients.length} recipient(s)`);

  const results = [];

  for (const to of recipients) {
    const masked = maskNumber(to);
    log(`Sending image to ${masked}...`);

    try {
      const { messageId } = await metaApiSend(creds.phoneNumberId, creds.token, to,
        buildTemplatePayload(ROSTER_TEMPLATE, [
          { type: 'header', parameters: [{ type: 'image', image: { id: mediaId } }] },
        ]),
      );
      log(`Sent to ${masked} — messageId: ${messageId}`);
      results.push({ to: masked, status: 'sent', messageId });
    } catch (err) {
      logWarn(`Failed to send to ${masked}: ${err.message}`);
      results.push({ to: masked, status: 'failed', error: err.message });
    }
  }

  const sentCount = results.filter(r => r.status === 'sent').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  log(`sendRosterImage complete — ${sentCount} sent, ${failedCount} failed`);

  return results;
}

/**
 * Send a plain-text WhatsApp message to one or more numbers via Meta Cloud API.
 *
 * Used for operational alerts (refresh warnings, cron failure notices, etc.).
 * Same sequential + isolated-error-handling pattern as sendRosterImage.
 *
 * @param {string} text         - Message body
 * @param {string[]} recipients - E.164 phone numbers
 * @returns {Promise<Array<{to, status, messageId?, error?}>>}
 */
export async function sendTextMessage(text, recipients) {
  log(`sendTextMessage — ${recipients.length} recipients`);

  if (recipients.length === 0) {
    logWarn('No recipients configured — skipping send');
    return [];
  }

  const creds = getMetaCredentials();
  if (!creds) {
    logWarn('Meta API credentials not configured (META_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN)');
    return recipients.map(to => ({
      to: maskNumber(to),
      status: 'failed',
      error: 'Meta API credentials not configured',
    }));
  }

  // Meta template body parameters cannot contain newline or tab characters (error 132018).
  // Collapse multi-line messages to a single line with ' | ' as the separator.
  const sanitized = text.split('\n').map(l => l.trim()).filter(Boolean).join(' | ');
  log(`sendTextMessage body (${sanitized.length} chars): ${sanitized.slice(0, 120)}${sanitized.length > 120 ? '…' : ''}`);

  const results = [];

  for (const to of recipients) {
    const masked = maskNumber(to);
    log(`Sending text to ${masked}...`);

    try {
      const { messageId } = await metaApiSend(creds.phoneNumberId, creds.token, to,
        buildTemplatePayload(ALERT_TEMPLATE, [
          { type: 'body', parameters: [{ type: 'text', text: sanitized }] },
        ]),
      );
      log(`Sent to ${masked} — messageId: ${messageId}`);
      results.push({ to: masked, status: 'sent', messageId });
    } catch (err) {
      logWarn(`Failed to send to ${masked}: ${err.message}`);
      results.push({ to: masked, status: 'failed', error: err.message });
    }
  }

  const sentCount = results.filter(r => r.status === 'sent').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  log(`sendTextMessage complete — ${sentCount} sent, ${failedCount} failed`);

  return results;
}
