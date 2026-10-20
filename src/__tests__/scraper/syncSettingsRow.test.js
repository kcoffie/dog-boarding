/**
 * readSettingsRow: the one reader of the single sync_settings row (#275).
 * @requirements REQ-109
 */
import { describe, it, expect } from 'vitest';
import { readSettingsRow } from '../../lib/scraper/syncSettingsRow.js';

// Records the query it was given and answers with `answer`.
function fakeDb(answer) {
  const q = {};
  const chain = {
    select: (cols) => { q.columns = cols; return chain; },
    order: (col, opts) => { q.order = [col, opts]; return chain; },
    limit: (n) => { q.limit = n; return chain; },
    maybeSingle: () => Promise.resolve(answer),
  };
  return { q, from: (table) => { q.table = table; return chain; } };
}

describe('readSettingsRow', () => {
  it('reads the requested columns of the lowest-id sync_settings row', async () => {
    const db = fakeDb({ data: { id: 1, schedule_cursor_date: '2026-10-19' }, error: null });
    const row = await readSettingsRow(db, 'schedule_cursor_date');
    expect(row).toEqual({ id: 1, schedule_cursor_date: '2026-10-19' });
    expect(db.q).toEqual({ table: 'sync_settings', columns: 'schedule_cursor_date', order: ['id', { ascending: true }], limit: 1 });
  });

  it('an empty table is null, not an error', async () => {
    expect(await readSettingsRow(fakeDb({ data: null, error: null }), 'id')).toBeNull();
  });

  it('a query error is thrown with its message, never read as "no row"', async () => {
    await expect(readSettingsRow(fakeDb({ data: null, error: { message: 'timeout' } }), 'id'))
      .rejects.toThrow('sync_settings read failed: timeout');
  });
});
