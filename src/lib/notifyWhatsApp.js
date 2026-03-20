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

// ---------------------------------------------------------------------------
// Meta Cloud API
// ---------------------------------------------------------------------------

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
 * Send the roster image to one or more WhatsApp numbers via Meta Cloud API.
 *
 * Iterates recipients sequentially (not parallel) to stay within Meta's rate
 * limits. Each recipient gets its own try/catch so a single bad number doesn't
 * block the rest of the list.
 *
 * @param {string} imageUrl     - Publicly accessible URL to the roster PNG
 * @param {string[]} recipients - E.164 phone numbers
 * @returns {Promise<Array<{to, status, messageId?, error?}>>}
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

  const results = [];

  for (const to of recipients) {
    const masked = maskNumber(to);
    log(`Sending image to ${masked}...`);

    try {
      const { messageId } = await metaApiSend(creds.phoneNumberId, creds.token, to, {
        type: 'image',
        image: { link: imageUrl },
      });
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

  const results = [];

  for (const to of recipients) {
    const masked = maskNumber(to);
    log(`Sending text to ${masked}...`);

    try {
      const { messageId } = await metaApiSend(creds.phoneNumberId, creds.token, to, {
        type: 'text',
        text: { body: text },
      });
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
