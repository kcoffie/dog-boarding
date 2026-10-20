/**
 * The one way to read the single `sync_settings` row (#275).
 *
 * The table is meant to hold one row, but nothing enforces that. Every reader and writer orders by
 * `id`, so if a duplicate ever appears they all use the same row instead of splitting the cursor
 * and the session cookies across two. A read error is thrown, never taken as "no row".
 *
 * @requirements REQ-109
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} columns - the select list
 * @returns {Promise<Object|null>} the row, or null when the table is empty
 * @throws {Error} `sync_settings read failed: …` on any query error
 */
export async function readSettingsRow(supabase, columns) {
  const { data, error } = await supabase
    .from('sync_settings')
    .select(columns)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`sync_settings read failed: ${error.message}`);
  return data ?? null;
}
