/* global process, Buffer */
/**
 * Where the roster goes (REQ-655). Meta locked WhatsApp on 2026-10-17; until Twilio SMS (#260) is
 * approved, the roster goes to Kate only, on Telegram. Design: docs/specs/roster-channel-design-note.md.
 *
 * ROSTER_CHANNEL (Vercel env) is required: there is no default, so a missing or mistyped value fails
 * the run instead of quietly sending somewhere else. The only value today is `telegram`; #260 adds
 * `twilio`. The channel owns its recipients: the Telegram path sends to TELEGRAM_ALERT_CHAT_ID and
 * never sees NOTIFY_RECIPIENTS (staff numbers).
 *
 * The roster image URL carries VITE_SYNC_PROXY_TOKEN and the Telegram API URL carries the bot token,
 * and the notify workflows print the handler's error body in public Actions logs. So no error or
 * result here ever includes a URL or a raw fetch error message: fixed text plus Telegram's own
 * error_code and description only.
 *
 * @requirements REQ-655
 */

export const ROSTER_CHANNELS = ['telegram'];
export const ROSTER_FETCH_TIMEOUT_MS = 30000;
export const ROSTER_SEND_TIMEOUT_MS = 15000;

/**
 * The configured channel, or an error naming the bad value (the value isn't secret).
 * @param {string|undefined} value - process.env.ROSTER_CHANNEL
 * @returns {{channel: string}|{error: string}}
 */
export function readRosterChannel(value) {
  if (ROSTER_CHANNELS.includes(value)) return { channel: value };
  const shown = value ? `"${value}"` : 'not set';
  // Stryker disable next-line StringLiteral: the ', ' separator can't show while there is one channel
  return { error: `ROSTER_CHANNEL is ${shown}; expected one of: ${ROSTER_CHANNELS.join(', ')}` };
}

/** Hourly intraday images go to staff only: off while the roster goes to Kate on Telegram. */
export function intradayEnabled(channel) {
  return channel !== 'telegram';
}

/** Name an error by kind only: fetch's own messages and options can carry the URL. */
function failureKind(err) {
  return err?.name === 'TimeoutError' ? 'timed out' : 'network error';
}

/**
 * Fetch the rendered roster PNG once; the caller stores and sends these same bytes.
 * @param {string} imageUrl - our own /api/roster-image or /api/intraday-image URL (token included)
 * @param {(url:string, init:object) => Promise<Response>} [fetchFn]
 * @returns {Promise<Buffer>}
 * @throws Error whose message never includes the URL
 */
export async function fetchRosterPng(imageUrl, fetchFn = fetch) {
  let res;
  try {
    res = await fetchFn(imageUrl, { signal: AbortSignal.timeout(ROSTER_FETCH_TIMEOUT_MS) });
  } catch (err) {
    // No `cause` on purpose: fetch's error can carry the token-bearing URL (REQ-655).
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Roster image fetch: ${failureKind(err)}`);
  }
  if (!res.ok) throw new Error(`Roster image fetch failed: HTTP ${res.status}`);
  try {
    return Buffer.from(await res.arrayBuffer()); // the body can still break or time out mid-read
  } catch (err) {
    // No `cause` on purpose: fetch's error can carry the token-bearing URL (REQ-655).
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Roster image fetch: ${failureKind(err)}`);
  }
}

/**
 * Send the roster PNG on the configured channel. Never throws.
 * @param {{ channel: string, png: Buffer, caption: string, fetchFn?: Function, env?: object }} args
 * @returns {Promise<Array<{to: string, status: 'sent'|'failed', error?: string}>>}
 */
export async function sendRoster({ channel, png, caption, fetchFn = fetch, env = process.env }) {
  if (channel === 'telegram') return sendTelegramPhoto({ png, caption, fetchFn, env });
  return [{ to: String(channel), status: 'failed', error: readRosterChannel(channel).error }];
}

async function sendTelegramPhoto({ png, caption, fetchFn, env }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chatId) {
    return [{ to: 'telegram', status: 'failed', error: 'Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID)' }];
  }
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('photo', new Blob([png], { type: 'image/png' }), 'roster.png');
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(ROSTER_SEND_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!body.ok) {
      return [{ to: 'telegram', status: 'failed', error: `Telegram sendPhoto ${body.error_code ?? res.status}: ${body.description ?? 'no description'}` }];
    }
    return [{ to: 'telegram', status: 'sent' }];
  } catch (err) {
    return [{ to: 'telegram', status: 'failed', error: `Telegram sendPhoto: ${failureKind(err)}` }];
  }
}
