/**
 * POST /api/send-question
 *
 * Accepts a question or comment from a logged-in user and forwards it to Kate
 * via WhatsApp. Uses the same alert channel as cron-health-check and
 * gmail-monitor (INTEGRATION_CHECK_RECIPIENTS — Kate only).
 *
 * Auth:    Authorization: Bearer {VITE_SYNC_PROXY_TOKEN}
 * Body:    { message: string, username: string }
 * Returns: { ok: true } | { ok: false, error: string }
 */

import { sendTextMessage, getAlertRecipients } from '../src/lib/notifyWhatsApp.js';

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
    const recipients = getAlertRecipients();
    if (recipients.length === 0) {
      console.warn('[SendQuestion] No recipients configured — skipping send');
      return res.status(200).json({ ok: true });
    }
    const results = await sendTextMessage(body, recipients);
    const failed = results.filter(r => r.status === 'failed');
    if (failed.length > 0) {
      console.warn(`[SendQuestion] ${failed.length}/${results.length} sends failed`);
    }
    console.log(`[SendQuestion] complete — ${results.length - failed.length} sent`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[SendQuestion] Error: ${err.message}`);
    return res.status(500).json({ ok: false, error: 'Failed to send message' });
  }
}
