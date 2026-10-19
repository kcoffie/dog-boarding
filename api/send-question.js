/**
 * POST /api/send-question
 *
 * Accepts a question or comment from a logged-in user and forwards it to Kate
 * through her alert channel (sendAlert, Telegram — REQ-652). The user sees "Sent!"
 * only when the question was delivered; otherwise 502, so it is never silently lost.
 * Each attempt is written to message_log (job 'send-question') so ops-watch can
 * report failures.
 *
 * Auth:    Authorization: Bearer {VITE_SYNC_PROXY_TOKEN}
 * Body:    { message: string, username: string }
 * Returns: { ok: true } | { ok: false, error: string }
 *
 * @requirements REQ-700, REQ-652
 */

import { createClient } from '@supabase/supabase-js';
import { sendAlert, alertDelivered } from '../src/lib/alertKate.js';
import { recordMessageLog } from '../src/lib/messageDeliveryStatus.js';

export const config = { runtime: 'nodejs' };

const MAX_MESSAGE_LENGTH = 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const proxyToken = process.env.VITE_SYNC_PROXY_TOKEN;
  if (proxyToken) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader !== `Bearer ${proxyToken}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  const { message, username } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Message is required' });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ ok: false, error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
  }

  const sender = typeof username === 'string' && username.trim() ? username.trim() : 'unknown';
  const body = `Question from ${sender}:\n${message.trim()}`;

  console.log(`[SendQuestion] user=${sender} chars=${message.trim().length}`);

  try {
    const results = await sendAlert(body);
    await logAttempt(results, body);
    if (!alertDelivered(results)) {
      console.error(`[SendQuestion] Not delivered: ${results.map(r => r.error).join('; ')}`);
      return res.status(502).json({ ok: false, error: 'Your message could not be delivered. Please try again later.' });
    }
    console.log('[SendQuestion] complete — delivered');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[SendQuestion] Error: ${err.message}`);
    return res.status(500).json({ ok: false, error: 'Failed to send message' });
  }
}

/** Write the attempt to message_log. Non-fatal: a logging failure never changes what the user is told. */
async function logAttempt(results, body) {
  try {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn('[SendQuestion] Supabase env not set — message_log not written');
      return;
    }
    await recordMessageLog(createClient(url, key), results, 'send-question', 'text', body, null);
  } catch (err) {
    console.warn(`[SendQuestion] message_log write failed: ${err.message}`);
  }
}
