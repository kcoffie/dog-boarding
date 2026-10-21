/**
 * A fake Supabase client holding the one site_access row (#324), for tests. It applies the same
 * filters PostgREST would (eq, is null, not is null), so a conditional update only changes the row
 * when its condition holds, and `.select()` after it returns the rows it changed.
 *
 * @param {Object|null} row  the starting row, or null for an empty table
 * @param {{ readError?: string, writeError?: string }} [opts]
 */
export function fakeSiteAccessDb(row, { readError, writeError } = {}) {
  const state = { row: row ? { id: true, ...row } : null, updates: [], inserts: [] };

  function from(table) {
    let op = 'select';
    let payload = null;
    const filters = [];

    const run = async () => {
      if (op === 'insert') {
        state.inserts.push({ table, payload });
        return { data: null, error: null };
      }
      if (table !== 'site_access') return { data: [], error: null };
      if (op === 'select') {
        if (readError) return { data: null, error: { message: readError } };
        const match = state.row && filters.every((f) => f(state.row));
        return { data: match ? [{ ...state.row }] : [], error: null };
      }
      if (writeError) return { data: null, error: { message: writeError } };
      if (op === 'upsert') {
        state.row = { ...(state.row ?? {}), ...payload };
        state.updates.push(payload);
        return { data: [{ id: true }], error: null };
      }
      // update
      if (!state.row || !filters.every((f) => f(state.row))) return { data: [], error: null };
      Object.assign(state.row, payload);
      state.updates.push(payload);
      return { data: [{ id: true }], error: null };
    };

    const builder = {
      select() { return builder; },
      update(p) { op = 'update'; payload = p; return builder; },
      upsert(p) { op = 'upsert'; payload = p; return builder; },
      insert(p) { op = 'insert'; payload = p; return builder; },
      eq(col, v) { filters.push((r) => r[col] === v); return builder; },
      is(col, v) { filters.push((r) => (r[col] ?? null) === v); return builder; },
      not(col, _op, v) { filters.push((r) => (r[col] ?? null) !== v); return builder; },
      limit() { return builder; },
      maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then: (resolve, reject) => run().then(resolve, reject),
    };
    return builder;
  }

  return { from, state };
}
