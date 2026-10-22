/**
 * A fake `cron_health` table for the Supabase client, with the PostgREST behaviour the 4am claim
 * relies on (REQ-658), each checked against production on 2026-10-22:
 *   - select(cols).eq('cron_name', n).maybeSingle(): only real columns; an unknown one is an error
 *   - upsert(row, { onConflict, ignoreDuplicates }): ignoreDuplicates leaves an existing row alone;
 *     otherwise only the given columns change (a column left out keeps its value)
 *   - update(patch).eq(...).or('...').select(...): the filters below; NULL never matches eq/neq/lt
 *
 * `rows` maps cron_name → row. A row of { error } or { throws } fails a read of it. `faults.upsert` /
 * `faults.update` ({ message }) fail those writes. Every write is pushed to `writes`.
 */

const COLUMNS = ['cron_name', 'last_ran_at', 'status', 'result', 'error_msg', 'updated_at'];

/** Split on commas outside parentheses. */
function splitTop(expr) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of expr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function field(row, col) {
  const json = /^(\w+)->>(\w+)$/.exec(col);
  if (json) {
    const v = row[json[1]]?.[json[2]];
    return v === undefined || v === null ? null : String(v);
  }
  return row[col] ?? null;
}

function test(row, col, op, raw) {
  const val = raw.replace(/^"(.*)"$/, '$1');
  const v = field(row, col);
  if (op === 'is') return val === 'null' ? v === null : false;
  if (v === null) return false; // SQL: NULL = x, NULL <> x and NULL < x are never true
  if (op === 'eq') return String(v) === val;
  if (op === 'neq') return String(v) !== val;
  if (op === 'lt') return new Date(v).getTime() < new Date(val).getTime();
  throw new Error(`fakeCronHealth: unsupported operator ${op}`);
}

function matchesTerm(row, term) {
  const and = /^and\((.*)\)$/.exec(term);
  if (and) return splitTop(and[1]).every((t) => matchesTerm(row, t));
  const m = /^([^.]+)\.(\w+)\.(.*)$/.exec(term);
  if (!m) throw new Error(`fakeCronHealth: can't read filter ${term}`);
  return test(row, m[1], m[2], m[3]);
}

export function fakeCronHealth(rows, { faults = {}, writes = [] } = {}) {
  return () => {
    let op = 'select';
    let cols = null;
    let payload = null;
    let opts = {};
    let orExpr = null;
    let returning = false;
    const eqs = [];

    const matching = () => Object.entries(rows)
      .filter(([name, row]) => !row.error && !row.throws
        && eqs.every(([c, v]) => (c === 'cron_name' ? name === v : test({ cron_name: name, ...row }, c, 'eq', v)))
        && (orExpr === null || splitTop(orExpr).some((t) => matchesTerm(row, t))));

    async function run() {
      if (op === 'upsert') {
        writes.push({ op, payload, opts });
        if (faults.upsert) return { data: null, error: faults.upsert };
        const { cron_name: name, ...rest } = payload;
        if (rows[name] && opts.ignoreDuplicates) return { data: null, error: null };
        rows[name] = { ...(rows[name] ?? {}), ...rest };
        return { data: null, error: null };
      }
      if (op === 'update') {
        writes.push({ op, payload, eqs: [...eqs], or: orExpr });
        if (faults.update) return { data: null, error: faults.update };
        const hit = matching();
        for (const [name] of hit) rows[name] = { ...rows[name], ...payload };
        return { data: returning ? hit.map(([name]) => ({ cron_name: name })) : null, error: null };
      }
      throw new Error('fakeCronHealth: a select must end in maybeSingle()');
    }

    const chain = {
      select(c) {
        if (op === 'select') cols = c; else returning = true;
        return chain;
      },
      eq(col, val) { eqs.push([col, String(val)]); return chain; },
      or(expr) { orExpr = expr; return chain; },
      upsert(p, o = {}) { op = 'upsert'; payload = p; opts = o; return chain; },
      update(p) { op = 'update'; payload = p; return chain; },
      async maybeSingle() {
        const name = eqs.find(([c]) => c === 'cron_name')?.[1];
        const row = rows[name];
        if (row?.throws) throw new Error(row.throws);
        if (row?.error) return { data: null, error: row.error };
        const wanted = cols.split(',').map((c) => c.trim());
        const unknown = wanted.find((c) => !COLUMNS.includes(c));
        if (unknown) return { data: null, error: { message: `column cron_health.${unknown} does not exist` } };
        if (!row) return { data: null, error: null };
        return { data: Object.fromEntries(wanted.map((c) => [c, row[c] ?? null])), error: null };
      },
      then(resolve, reject) { return run().then(resolve, reject); },
    };
    return chain;
  };
}
