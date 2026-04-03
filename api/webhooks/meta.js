/**
 * Meta webhook handler — receives and stores WhatsApp delivery status events.
 *
 * GET /api/webhooks/meta  — Meta verification challenge (one-time setup)
 * POST /api/webhooks/meta — Delivery status events (sent → delivered → read/failed)
 *
 * Security model:
 *   GET:  token comparison against META_WEBHOOK_VERIFY_TOKEN.
 *   POST: HMAC-SHA256 signature verification via META_APP_SECRET.
 *         Raw body is read before JSON.parse — after parsing, byte-exact
 *         signature verification is impossible.
 *         If META_APP_SECRET is not set, the endpoint returns 503 rather
 *         than skipping verification (skipping would allow anyone to write
 *         arbitrary rows to message_delivery_status).
 *
 * Meta webhook payload shape (delivery status events):
 *   {
 *     "object": "whatsapp_business_account",
 *     "entry": [{
 *       "changes": [{
 *         "value": {
 *           "statuses": [{
 *             "id": "wamid.xxx",
 *             "status": "delivered",
 *             "timestamp": "1712345678",
 *             "recipient_id": "18312477375",
 *             "errors": [{ "code": 131026, "title": "..." }]
 *           }]
 *         }
 *       }]
 *     }]
 *   }
 *
 * Meta may also POST message/contact events (no "statuses" key) — these are
 * logged and ignored. Only status events are written to the DB.
 *
 * @requirements REQ-v5.0-F1
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { upsertDeliveryStatus } from '../../src/lib/messageDeliveryStatus.js';

export const config = { runtime: 'nodejs' };

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 *
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHeader - Value of X-Hub-Signature-256
 * @param {string} appSecret
 * @returns {boolean}
 */
export function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const provided = signatureHeader.slice('sha256='.length);

  // timingSafeEqual requires equal-length buffers — a different-length hex
  // string means the signature is definitely wrong.
  if (provided.length !== 64) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(provided,  'hex')
  );
}

/**
 * Read the full request body as a raw Buffer.
 * Must be called before any JSON.parse — the HMAC is computed over raw bytes.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  ()    => resolve(Buffer.concat(chunks)));
    req.on('error', err  => reject(err));
  });
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  // -------------------------------------------------------------------------
  // GET — Meta verification challenge
  // One-time handshake when registering the webhook in Meta Business Manager.
  // Meta sends: hub.mode=subscribe, hub.verify_token, hub.challenge
  // We respond with hub.challenge if the token matches.
  // -------------------------------------------------------------------------
  if (req.method === 'GET') {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!verifyToken) {
      console.error('[WebhookMeta] META_WEBHOOK_VERIFY_TOKEN not set — cannot complete verification');
      return res.status(503).json({ error: 'Webhook verify token not configured' });
    }

    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`[WebhookMeta] GET verification — mode: ${mode}, token match: ${token === verifyToken}`);

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WebhookMeta] Verification successful — returning challenge');
      return res.status(200).send(challenge);
    }

    console.warn('[WebhookMeta] Verification failed — mode or token mismatch');
    return res.status(403).json({ error: 'Forbidden' });
  }

  // -------------------------------------------------------------------------
  // POST — delivery status events
  // -------------------------------------------------------------------------
  if (req.method === 'POST') {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      // Fail closed — never skip signature verification.
      // Without it, anyone who discovers the endpoint URL can write arbitrary rows.
      console.error('[WebhookMeta] META_APP_SECRET not set — rejecting (signature cannot be verified)');
      return res.status(503).json({ error: 'Webhook signature verification not configured' });
    }

    // Read raw bytes before any parsing — HMAC is computed over the exact bytes Meta sent.
    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch (err) {
      console.error('[WebhookMeta] Failed to read request body:', err.message);
      return res.status(400).json({ error: 'Could not read request body' });
    }

    const signatureHeader = req.headers['x-hub-signature-256'];
    console.log(`[WebhookMeta] POST — body ${rawBody.length} bytes, signature header present: ${!!signatureHeader}`);

    let signatureValid = false;
    try {
      signatureValid = verifySignature(rawBody, signatureHeader, appSecret);
    } catch (err) {
      // timingSafeEqual throws if buffer lengths differ — treat as invalid.
      console.warn('[WebhookMeta] Signature verification threw (treating as invalid):', err.message);
    }

    if (!signatureValid) {
      console.warn('[WebhookMeta] Signature verification FAILED — rejecting');
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    console.log('[WebhookMeta] Signature verified ✓');

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      console.error('[WebhookMeta] Failed to parse JSON body:', err.message);
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Meta sends events for multiple object types (e.g. instagram) — ignore non-WhatsApp.
    if (payload.object !== 'whatsapp_business_account') {
      console.log(`[WebhookMeta] Ignoring non-WhatsApp event object: "${payload.object}"`);
      return res.status(200).json({ ok: true });
    }

    let supabase;
    try {
      supabase = getSupabase();
    } catch (err) {
      console.error('[WebhookMeta] Cannot initialize DB client:', err.message);
      return res.status(500).json({ error: 'DB configuration error' });
    }

    let processed = 0;
    let errors    = 0;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const statuses = change.value?.statuses;

        if (!Array.isArray(statuses) || statuses.length === 0) {
          // Meta also posts incoming message events and contact events —
          // those don't have a 'statuses' key. Log and skip cleanly.
          console.log('[WebhookMeta] Change has no statuses array — skipping (likely a messages/contacts event)');
          continue;
        }

        for (const statusEvent of statuses) {
          const wamid       = statusEvent.id;
          const status      = statusEvent.status;
          const timestamp   = statusEvent.timestamp;
          const recipientId = statusEvent.recipient_id ?? '';
          const firstError  = statusEvent.errors?.[0];
          const errorCode   = firstError?.code  ?? null;
          const errorTitle  = firstError?.title ?? null;

          // Meta timestamps are Unix epoch strings — convert to ISO for DB storage.
          const statusAt = timestamp
            ? new Date(parseInt(timestamp, 10) * 1000).toISOString()
            : new Date().toISOString();

          // Mask recipient — never store raw phone numbers.
          // Meta sends recipient_id without the '+' prefix.
          const maskedRecipient = recipientId
            ? `***-***-${recipientId.replace(/\D/g, '').slice(-4)}`
            : 'unknown';

          try {
            await upsertDeliveryStatus(supabase, {
              wamid,
              status,
              statusAt,
              recipient: maskedRecipient,
              errorCode,
              errorTitle,
              rawPayload: statusEvent,
            });
            processed++;
          } catch (err) {
            console.error(`[WebhookMeta] Failed to upsert status for wamid ${wamid} (${status}): ${err.message}`);
            errors++;
            // Continue processing remaining events — don't let one DB error
            // block the rest. Meta will retry on non-2xx; we return 200 to avoid
            // exponential retry storms for a transient DB hiccup.
          }
        }
      }
    }

    console.log(`[WebhookMeta] POST complete — ${processed} status event(s) processed, ${errors} error(s)`);
    return res.status(200).json({ ok: true, processed, errors });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
