/**
 * Hook for fetching the last 5 days of outbound WhatsApp messages from
 * message_log, with signed URLs generated for image rows so the page
 * can render the actual roster PNG inline.
 *
 * @requirements REQ-v5.0-F2
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const DAYS_WINDOW = 5;
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Fetch message_log rows for the last N days, ordered newest-first.
 * @returns {Promise<Array>}
 */
async function fetchMessageLog() {
  const cutoff = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[MessageLog] Loading — cutoff: ${cutoff}`);

  const { data, error } = await supabase
    .from('message_log')
    .select('*')
    .gte('sent_at', cutoff)
    .order('sent_at', { ascending: false });

  if (error) {
    console.error(`[MessageLog] Load failed: ${error.message}`);
    throw error;
  }

  return data || [];
}

/**
 * Generate signed URLs for rows where image_path is set.
 * image_path format: 'roster-images/{jobName}/{timestamp}.png'
 * The bucket name is stripped before calling createSignedUrl.
 *
 * Returns the rows array with a signedUrl property injected on image rows.
 * Errors generating individual URLs are logged but do not fail the whole load.
 *
 * @param {Array} rows
 * @returns {Promise<Array>}
 */
async function injectSignedUrls(rows) {
  const imageRows = rows.filter(r => r.image_path);
  if (imageRows.length === 0) return rows;

  console.log(`[MessageLog] Loaded ${rows.length} rows — generating signed URLs for ${imageRows.length} image rows`);

  const withUrls = await Promise.all(
    rows.map(async row => {
      if (!row.image_path) return row;

      // image_path is stored as 'roster-images/{path}' — strip the bucket prefix
      const pathInBucket = row.image_path.replace(/^roster-images\//, '');

      const { data, error } = await supabase.storage
        .from('roster-images')
        .createSignedUrl(pathInBucket, SIGNED_URL_TTL_SECONDS);

      if (error) {
        console.warn(`[MessageLog] Signed URL failed for ${row.image_path}: ${error.message}`);
        return { ...row, signedUrl: null };
      }

      console.log(`[MessageLog] Signed URL generated for ${row.image_path}`);
      return { ...row, signedUrl: data.signedUrl };
    })
  );

  return withUrls;
}

export function useMessageLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const rawRows = await fetchMessageLog();
      const enriched = await injectSignedUrls(rawRows);
      setRows(enriched);
    } catch (err) {
      console.error('[MessageLog] useMessageLog load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, error, refresh: load };
}

export default useMessageLog;
