/**
 * Migration 031 (#370), read as text: there's no local Postgres, so these pin the rules that stop a
 * night being paid twice. Kate runs supabase/checks/031_payment_nights_check.sql on production for
 * the behaviour. Skipped where supabase/ isn't present (Stryker's sandbox).
 * @requirements REQ-041
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/031_payment_nights.sql');
const CHECK = resolve(process.cwd(), 'supabase/checks/031_payment_nights_check.sql');

// The SQL with comments removed, whitespace collapsed, lower case.
const code = (path) => readFileSync(path, 'utf8')
  .split('\n').map((line) => line.replace(/--.*$/, '')).join(' ')
  .replace(/\s+/g, ' ').toLowerCase();

describe.skipIf(!existsSync(MIGRATION))('migration 031: a night is paid once', () => {
  const sql = existsSync(MIGRATION) ? code(MIGRATION) : '';

  it('runs in one transaction', () => {
    expect(sql.trim().startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('every payment must carry its night amounts', () => {
    expect(sql).toContain('alter table payments add column night_amounts jsonb not null;');
  });

  it('the night is the primary key, and deleting a payment frees its nights', () => {
    expect(sql).toMatch(/create table payment_nights \( night date primary key, payment_id uuid not null references payments\(id\) on delete cascade, amount numeric\(10,2\) not null/);
  });

  it('signed-in users can only read payment_nights; anon nothing', () => {
    expect(sql).toContain('alter table payment_nights enable row level security;');
    expect(sql).toContain('revoke all on payment_nights from anon, authenticated;');
    expect(sql).toContain('grant select on payment_nights to authenticated;');
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*on payment_nights/);
    expect(sql).not.toMatch(/create policy[^;]*on payment_nights for (insert|update|delete|all)/);
  });

  it('the nights are written by an AFTER INSERT trigger in the same transaction', () => {
    expect(sql).toContain('create trigger payments_fill_nights after insert on payments for each row execute function payment_fill_nights();');
  });

  it('the trigger function is security definer with a fixed search_path, not callable directly', () => {
    expect(sql).toMatch(/create function payment_fill_nights\(\) returns trigger language plpgsql security definer set search_path = public, pg_temp/);
    expect(sql).toContain('revoke execute on function payment_fill_nights() from public;');
  });

  it('checks the row before writing nights: object, nights present and unique, keys = dates, cents, sum', () => {
    const body = sql.slice(sql.indexOf('create function payment_fill_nights'), sql.indexOf('create trigger payments_fill_nights'));
    for (const rule of [
      "jsonb_typeof(new.night_amounts) is distinct from 'object'",
      'coalesce(cardinality(new.dates), 0) = 0',
      'cardinality(new.dates) <> (select count(distinct d) from unnest(new.dates) as d)',
      'new.nights is distinct from cardinality(new.dates)',
      'night_keys is distinct from night_dates',
      "<> round((v #>> '{}')::numeric, 2)",
      "(v #>> '{}')::numeric < 0",
      'total is distinct from new.amount',
    ]) expect(body).toContain(rule);
    // Every check raises before the insert.
    expect(body.lastIndexOf('raise exception')).toBeLessThan(body.indexOf('insert into payment_nights'));
  });

  it('writes nights in night order (no deadlock between overlapping payments)', () => {
    expect(sql).toMatch(/insert into payment_nights \(night, payment_id, amount\) select d, new\.id, .* from unnest\(new\.dates\) as d order by d;/);
  });

  it('a payment\'s nights and amounts cannot be updated', () => {
    expect(sql).toContain('create trigger payments_amounts_fixed before update of dates, amount, night_amounts, nights on payments');
    const body = sql.slice(sql.indexOf('create function payment_amounts_fixed'), sql.indexOf('create trigger payments_amounts_fixed'));
    for (const col of ['dates', 'amount', 'night_amounts', 'nights']) {
      expect(body).toContain(`new.${col} is distinct from old.${col}`);
    }
    expect(body).toContain('raise exception');
  });

  it('reloads the API schema so the new column is visible at once', () => {
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });
});

describe.skipIf(!existsSync(CHECK))('check script for 031', () => {
  const sql = existsSync(CHECK) ? code(CHECK) : '';

  it('runs as a signed-in user and leaves nothing behind', () => {
    expect(sql.trim().startsWith('begin;')).toBe(true);
    expect(sql).toContain('set local role authenticated;');
    expect(sql.trim().endsWith('rollback;')).toBe(true);
    expect(sql).not.toContain('commit;');
  });

  it('only uses 2099 dates', () => {
    const dates = sql.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((d) => d.startsWith('2099-'))).toBe(true);
  });
});
