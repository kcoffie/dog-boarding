/**
 * WhatsApp notification wrapper — sends the daily roster image via Twilio.
 *
 * Design: thin wrapper around the Twilio REST API. All Twilio-specific error
 * handling is isolated here so callers (api/notify.js) work with a simple
 * { status, sid } contract. No business logic lives here.
 *
 * Twilio WhatsApp requires:
 *   from: "whatsapp:+14155238886"   (sandbox number or approved sender)
 *   to:   "whatsapp:+18312477375"
 *   mediaUrl: [publicly accessible image URL]
 *
 * Security: recipient numbers are masked to last 4 digits in all log output.
 *
 * @requirements REQ-v4.1
 */

import twilio from 'twilio';
import { createSyncLogger } from './scraper/logger.js';

const logger = createSyncLogger('NotifyWA');
const log = logger.log;
const logWarn = logger.warn;

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
// Twilio client factory
// ---------------------------------------------------------------------------

/**
 * Create a Twilio REST client from environment variables.
 *
 * Error-handling: throws if required env vars are missing so the caller
 * can log a clear error and skip the send rather than passing undefined
 * credentials to Twilio (which would throw an opaque HTTP 401).
 *
 * @returns {import('twilio').Twilio}
 */
export function createTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio env vars not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
  }
  return twilio(sid, token);
}

// ---------------------------------------------------------------------------
// Send function
// ---------------------------------------------------------------------------

/**
 * Send the roster image to one or more WhatsApp numbers.
 *
 * Iterates recipients sequentially (not parallel) to avoid Twilio rate limits.
 * Each recipient gets its own try/catch so a single bad number doesn't block
 * the rest of the list.
 *
 * Decision logging at each step:
 *   - Entry: recipient count, masked numbers, image URL host
 *   - Per-recipient: masked number, Twilio SID on success, error code on failure
 *   - Exit: sent count, failed count
 *
 * @param {import('twilio').Twilio} client - Twilio client instance
 * @param {string} imageUrl               - Public URL to the roster PNG
 * @param {string[]} recipients           - E.164 phone numbers to send to
 * @param {string} fromNumber             - E.164 Twilio sender number
 * @returns {Promise<Array<{to, status, sid?, error?}>>}
 */
export async function sendRosterImage(client, imageUrl, recipients, fromNumber) {
  log(`sendRosterImage — ${recipients.length} recipients, imageUrl host: ${new URL(imageUrl).hostname}`);

  if (recipients.length === 0) {
    logWarn('No recipients configured — skipping send');
    return [];
  }

  const results = [];

  for (const to of recipients) {
    const masked = maskNumber(to);
    log(`Sending to ${masked}...`);

    try {
      const message = await client.messages.create({
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:${to}`,
        mediaUrl: [imageUrl],
        // body is required by some WhatsApp clients even for media-only messages.
        body: '',
      });

      log(`Sent to ${masked} — SID: ${message.sid}, status: ${message.status}`);
      results.push({ to: masked, status: 'sent', sid: message.sid });

    } catch (err) {
      // Twilio errors have a `code` property (numeric error code) and `status` (HTTP).
      // Log both for diagnosis. Common codes: 21608 (unverified number), 63016 (sandbox limit).
      const code = err.code ?? 'unknown';
      const httpStatus = err.status ?? 'unknown';
      logWarn(`Failed to send to ${masked} — Twilio error ${code} (HTTP ${httpStatus}): ${err.message}`);
      results.push({ to: masked, status: 'failed', error: err.message, twilioCode: code });
    }
  }

  const sentCount = results.filter(r => r.status === 'sent').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  log(`sendRosterImage complete — ${sentCount} sent, ${failedCount} failed`);

  return results;
}
