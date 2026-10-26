/**
 * In-memory Supabase for the mapping tests (#344). It fakes the database boundary only, so the sync's
 * own queries run as written: eq / is / in / ilike / like / lte / gte / lt filters, limit, single and
 * maybeSingle, update and insert that return the rows they changed, and the unique index on
 * dogs.external_pet_id (migration 030), which answers a duplicate with Postgres's 23505.
 *
 * Column lists in select() are ignored: every row comes back whole, which is a superset of any projection.
 * `_hooks.beforeUpdate(table, rows)` and `_hooks.beforeInsert(table, rows)` run just before the write is
 * applied, to play another runner writing in between a read and a write.
 * `failOn(table, op, filters)` returning an error makes that query answer with it, as PostgREST does.
 */

// SQL LIKE pattern → RegExp, as Postgres reads it: % is any run, _ is one character, a backslash makes
// the next character literal (a trailing backslash is an error in Postgres), everything else is literal
function likeToRegExp(pattern, flags) {
  const literal = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      if (i === pattern.length - 1) throw new Error('LIKE pattern must not end with escape character');
      source += literal(pattern[++i]);
    } else if (ch === '%') source += '.*';
    else if (ch === '_') source += '.';
    else source += literal(ch);
  }
  return new RegExp(`^${source}$`, flags);
}

// Timestamps compare as moments, as in Postgres: "…+00:00" and "….000Z" don't sort as text
const ISO_MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const order = (a, b) => (ISO_MOMENT.test(a) && ISO_MOMENT.test(b) ? Date.parse(a) - Date.parse(b) : a < b ? -1 : a > b ? 1 : 0);

function matches(row, [op, field, value]) {
  const actual = row[field] ?? null;
  if (op === 'eq') return actual === value;
  if (op === 'is') return actual === value;
  if (op === 'in') return value.includes(actual);
  if (op === 'ilike') return actual !== null && likeToRegExp(value, 'i').test(actual);
  if (op === 'like') return actual !== null && likeToRegExp(value, '').test(actual);
  if (op === 'lte') return actual !== null && order(actual, value) <= 0;
  if (op === 'gte') return actual !== null && order(actual, value) >= 0;
  if (op === 'lt') return actual !== null && order(actual, value) < 0;
  throw new Error(`fakeSupabase: no filter ${op}`);
}

export function createFakeSupabase({ uniquePetId = true, failOn = () => null } = {}) {
  const data = { dogs: [], boardings: [], sync_appointments: [], sync_queue: [], boarding_forms: [] };
  const hooks = { beforeUpdate: null, beforeInsert: null };
  let nextId = 0;

  // The unique index: another dog already holding this pet ID
  function violatesUnique(table, row, selfId) {
    if (!uniquePetId || table !== 'dogs' || row.external_pet_id == null) return false;
    return data.dogs.some((d) => d.id !== selfId && d.external_pet_id === row.external_pet_id);
  }
  const uniqueError = { code: '23505', message: 'duplicate key value violates unique constraint "dogs_external_pet_id_key"' };

  function builder(table, op, values) {
    const filters = [];
    let limit = null;
    let returning = op === 'select';

    const run = (mode) => {
      const failure = failOn(table, op, filters);
      if (failure) return { data: null, error: failure };
      if (op === 'insert') {
        const rows = (Array.isArray(values) ? values : [values]).map((v) => ({ id: `${table}-${++nextId}`, ...v }));
        hooks.beforeInsert?.(table, rows);
        if (rows.some((r) => violatesUnique(table, r, null))) return { data: null, error: uniqueError };
        data[table].push(...rows);
        return shape(rows, mode);
      }
      let rows = data[table].filter((r) => filters.every((f) => matches(r, f)));
      if (limit !== null) rows = rows.slice(0, limit);
      if (op === 'update') {
        hooks.beforeUpdate?.(table, rows);
        rows = data[table].filter((r) => filters.every((f) => matches(r, f)));
        if (rows.some((r) => violatesUnique(table, { ...r, ...values }, r.id))) return { data: null, error: uniqueError };
        for (const r of rows) Object.assign(r, values);
        if (!returning) return { data: null, error: null };
      }
      if (op === 'delete') {
        data[table] = data[table].filter((r) => !rows.includes(r));
        return { data: null, error: null };
      }
      return shape(rows.map((r) => ({ ...r })), mode);
    };

    const shape = (rows, mode) => {
      if (mode === 'many') return { data: rows, error: null };
      if (rows.length === 1) return { data: rows[0], error: null };
      if (rows.length === 0 && mode === 'maybe') return { data: null, error: null };
      return { data: null, error: { code: 'PGRST116', message: `${rows.length} rows` } };
    };

    const b = {
      select() { returning = true; return b; },
      eq(f, v) { filters.push(['eq', f, v]); return b; },
      is(f, v) { filters.push(['is', f, v]); return b; },
      in(f, v) { filters.push(['in', f, v]); return b; },
      ilike(f, v) { filters.push(['ilike', f, v]); return b; },
      like(f, v) { filters.push(['like', f, v]); return b; },
      lte(f, v) { filters.push(['lte', f, v]); return b; },
      gte(f, v) { filters.push(['gte', f, v]); return b; },
      lt(f, v) { filters.push(['lt', f, v]); return b; },
      order() { return b; },
      limit(n) { limit = n; return b; },
      single: () => Promise.resolve(run('single')),
      maybeSingle: () => Promise.resolve(run('maybe')),
      then: (resolve, reject) => Promise.resolve(run('many')).then(resolve, reject),
    };
    return b;
  }

  const add = (table, prefix) => (row) => {
    const full = { id: `${prefix}-${++nextId}`, ...row };
    data[table].push(full);
    return full;
  };

  return {
    from: (table) => ({
      select: () => builder(table, 'select'),
      insert: (values) => builder(table, 'insert', values),
      update: (values) => builder(table, 'update', values),
      delete: () => builder(table, 'delete'),
    }),
    _mockData: data,
    _hooks: hooks,
    _addDog: add('dogs', 'dog'),
    _addBoarding: add('boardings', 'boarding'),
    _addSyncAppointment: add('sync_appointments', 'sync'),
    _addQueueItem: add('sync_queue', 'queue'),
  };
}
