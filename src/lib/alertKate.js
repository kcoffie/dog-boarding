/**
 * The one way to alert Kate: a dedicated Telegram bot (#259). WhatsApp alerts stopped when Meta
 * disabled the account on 2026-10-18. Design: docs/specs/telegram-alerts-design-note.md.
 *
 * sendAlert never throws. It returns results shaped like sendTextMessage's, so callers can keep
 * recording them in message_log, and every caller decides on alertDelivered(results).
 *
 * The bot token is part of the URL (api.telegram.org/bot<token>/sendMessage), and Vercel logs don't
 * mask secrets, so no error or log line here may include the URL or the fetch options.
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID
 *
 * @requirements REQ-652
 */

import { recordMessageLog } from './messageDeliveryStatus.js';

export const ALERT_MAX_CHARS = 4000; // Telegram's limit is 4096
export const ALERT_TIMEOUT_MS = 15000;

const TO = 'telegram';

/** Cut to `max` code points (an emoji is never split), marking the cut with "…". */
export function truncateAlert(text, max = ALERT_MAX_CHARS) {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join('') + '…';
}

/** True when at least one channel accepted the alert. */
export function alertDelivered(results) {
  return Array.isArray(results) && results.some(r => r.status === 'sent');
}

/**
 * Send one plain-text alert to Kate. One attempt, no retry: the next scheduled run is the retry.
 *
 * @param {string} text
 * @returns {Promise<Array<{to: string, status: 'sent'|'failed', error?: string}>>}
 */
export async function sendAlert(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chatId) {
    console.error('[Alert] Telegram alert channel not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID)');
    return [{ to: TO, status: 'failed', error: 'Telegram alert channel not configured' }];
  }

  try {
    // No parse_mode: plain text, so "_" or "*" in an alert can't make Telegram reject it.
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: truncateAlert(String(text ?? '')) }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!body.ok) {
      const error = `Telegram sendMessage ${body.error_code ?? res.status}: ${body.description ?? 'no description'}`;
      console.error(`[Alert] ${error}`);
      return [{ to: TO, status: 'failed', error }];
    }
    console.log(`[Alert] Sent to Telegram (${Array.from(String(text ?? '')).length} chars)`);
    return [{ to: TO, status: 'sent' }];
  } catch (err) {
    // A network error or timeout. err.message from fetch never contains the URL, but the name is enough.
    const error = `Telegram sendMessage: ${err?.name === 'TimeoutError' ? 'timed out' : 'network error'}`;
    console.error(`[Alert] ${error}`);
    return [{ to: TO, status: 'failed', error }];
  }
}

/**
 * Send an alert and write it to message_log under `jobName` (sent or failed), so ops-watch can
 * report undelivered alerts. The log write is non-fatal. Returns true when the alert was delivered;
 * a caller that gets false must make its run fail (REQ-652).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient|null} supabase
 * @param {string} jobName - e.g. 'cron-health-check'
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function alertAndLog(supabase, jobName, text) {
  const results = await sendAlert(text);
  try {
    await recordMessageLog(supabase, results, jobName, 'text', text, null);
  } catch (err) {
    console.warn(`[Alert] message_log write failed for ${jobName}: ${err.message}`);
  }
  const delivered = alertDelivered(results);
  if (!delivered) console.error(`[Alert] ${jobName}: alert NOT delivered — ${results.map(r => r.error).join('; ')}`);
  return delivered;
}

/**
 * A run's exit code after its alert: 1 when an alert was sent but not delivered (the run goes red and
 * GitHub emails Kate), otherwise 0. `delivered` is null when no alert was needed.
 *
 * @param {boolean|null} delivered
 * @returns {0|1}
 */
export function exitCodeAfterAlert(delivered) {
  return delivered === false ? 1 : 0;
}
