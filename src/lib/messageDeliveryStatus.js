/**
 * Message delivery status helpers — record outbound WhatsApp messages and
 * incoming Meta delivery events to the message_delivery_status table.
 *
 * Two write paths:
 *
 *   recordSentMessages   — called at send time. Inserts one row per successful
 *                          send result with status='sent'. Source: sendRosterImage
 *                          or sendTextMessage return values.
 *
 *   upsertDeliveryStatus — called by POST /api/webhooks/meta when Meta sends a
 *                          delivery/read/failed event. Upserts on (wamid, status)
 *                          so Meta's at-least-once delivery is idempotent.
 *
 * Both functions are non-fatal callers: they log on error and either return
 * gracefully (recordSentMessages) or re-throw (upsertDeliveryStatus, so the
 * webhook handler can count errors and still return 200 to Meta).
 *
 * @requirements REQ-v5.0-F1
 */

// Status values Meta sends in webhook events.
const VALID_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

/**
 * Write one row per successful send result to message_delivery_status.
 *
 * Skips results where status !== 'sent' (failed sends have no wamid to record)
 * or where messageId is missing. Non-fatal — a DB error is logged and swallowed
 * so the caller's response is never blocked.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient|null} supabase
 *   Pass null to skip DB write (e.g. when called before DB is initialized).
 * @param {Array<{to: string, status: string, messageId?: string}>} results
 *   Array returned by sendRosterImage or sendTextMessage.
 * @param {string} sendJob
 *   Job name for audit purposes, e.g. 'notify-4am', 'integration-check'.
 * @returns {Promise<void>}
 */
export async function recordSentMessages(supabase, results, sendJob) {
  if (!supabase) {
    console.log(`[DeliveryStatus] recordSentMessages(${sendJob}) — no supabase client, skipping`);
    return;
  }

  const rows = results
    .filter(r => r.status === 'sent' && r.messageId)
    .map(r => ({
      wamid:     r.messageId,
      recipient: r.to,       // already masked to last 4 digits by notifyWhatsApp.js
      send_job:  sendJob,
      status:    'sent',
      sent_at:   new Date().toISOString(),
    }));

  if (rows.length === 0) {
    console.log(`[DeliveryStatus] recordSentMessages(${sendJob}) — no successful sends to record`);
    return;
  }

  console.log(`[DeliveryStatus] Recording ${rows.length} sent message(s) for job "${sendJob}"`);

  const { error } = await supabase
    .from('message_delivery_status')
    .upsert(rows, { onConflict: 'wamid,status' });

  if (error) {
    console.warn(`[DeliveryStatus] Failed to record sent messages for job "${sendJob}": ${error.message}`);
  } else {
    console.log(`[DeliveryStatus] Recorded ${rows.length} row(s) — wamids: ${rows.map(r => r.wamid).join(', ')}`);
  }
}

/**
 * Write one row per send result (both sent and failed) to message_log.
 *
 * Unlike recordSentMessages, this records ALL send attempts including failures:
 * failed rows have status='failed' and wamid=null. The whole point is a complete
 * outbound audit trail that the /messages page can render.
 *
 * Non-fatal — a DB error is logged and swallowed so the caller's flow is
 * never blocked.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient|null} supabase
 * @param {Array<{to: string, status: string, messageId?: string, error?: string}>} results
 * @param {string} jobName      - e.g. 'notify-4am', 'cron-health-check'
 * @param {'image'|'text'} messageType
 * @param {string|null} content       - text body for 'text'; null for 'image'
 * @param {string|null} imagePath     - Supabase Storage path for 'image'; null for 'text'
 * @returns {Promise<void>}
 */
export async function recordMessageLog(supabase, results, jobName, messageType, content, imagePath) {
  if (!supabase) {
    console.log(`[MessageLog] recordMessageLog("${jobName}") — no supabase client, skipping`);
    return;
  }

  if (!results || results.length === 0) {
    console.log(`[MessageLog] recordMessageLog("${jobName}") — no results to record`);
    return;
  }

  console.log(`[MessageLog] recordMessageLog("${jobName}", type=${messageType}, ${results.length} results)`);

  const rows = results.map(r => {
    const row = {
      job_name:     jobName,
      message_type: messageType,
      recipient:    r.to,
      content:      content ?? null,
      image_path:   imagePath ?? null,
      wamid:        r.status === 'sent' ? (r.messageId ?? null) : null,
      status:       r.status === 'sent' ? 'sent' : 'failed',
    };
    console.log(
      `[MessageLog] Writing row — recipient: ${r.to}, wamid: ${row.wamid ?? 'null'}, status: ${row.status}` +
      (imagePath ? `, image_path: ${imagePath}` : '')
    );
    return row;
  });

  const { error } = await supabase.from('message_log').insert(rows);

  if (error) {
    console.warn(`[MessageLog] DB write failed for job "${jobName}" (type=${messageType}, ${rows.length} rows): ${error.message}`);
  } else {
    console.log(`[MessageLog] Wrote ${rows.length} row(s) for job "${jobName}"`);
  }
}

/**
 * Upsert a delivery status event received from a Meta webhook POST.
 * Called once per status entry in the webhook payload.
 *
 * Uses ON CONFLICT(wamid, status) so duplicate events from Meta's at-least-once
 * delivery update status_at without creating duplicate rows.
 *
 * Re-throws on DB error so the webhook handler can count errors per-event
 * while still returning 200 to Meta (Meta retries on non-2xx).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string}      params.wamid
 * @param {string}      params.status         - 'delivered' | 'read' | 'failed'
 * @param {string}      params.statusAt       - ISO timestamp
 * @param {string}      params.recipient      - Already masked, e.g. '***-***-7375'
 * @param {number|null} params.errorCode
 * @param {string|null} params.errorTitle
 * @param {object}      params.rawPayload     - Full Meta status object for debugging
 * @returns {Promise<void>}
 * @throws {Error} on DB write failure
 */
export async function upsertDeliveryStatus(supabase, {
  wamid,
  status,
  statusAt,
  recipient,
  errorCode,
  errorTitle,
  rawPayload,
}) {
  if (!VALID_STATUSES.has(status)) {
    console.warn(`[DeliveryStatus] Unknown status "${status}" for wamid ${wamid} — skipping`);
    return;
  }

  console.log(`[DeliveryStatus] Upserting — wamid: ${wamid}, status: ${status}, recipient: ${recipient}, at: ${statusAt}${errorCode ? `, error: ${errorCode} ${errorTitle}` : ''}`);

  const { error } = await supabase
    .from('message_delivery_status')
    .upsert(
      {
        wamid,
        recipient,
        send_job:   'webhook',
        status,
        status_at:  statusAt,
        error_code:  errorCode ?? null,
        error_title: errorTitle ?? null,
        raw_payload: rawPayload,
      },
      { onConflict: 'wamid,status' }
    );

  if (error) {
    console.warn(`[DeliveryStatus] DB write failed for wamid ${wamid} status ${status}: ${error.message}`);
    throw error;
  }

  console.log(`[DeliveryStatus] Upserted status "${status}" for wamid ${wamid}`);
}
