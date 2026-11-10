/**
 * Migration 032 (#389), read as text: there's no Postgres in CI, so these pin the rules that lock
 * paid nights and keep deleted payments. Kate runs supabase/checks/032_paid_nights_locked_check.sql
 * (and 031's) on production for the behaviour; both were also run against a local WebAssembly
 * Postgres while building. Skipped where supabase/ isn't present (Stryker's sandbox).
 * @requirements REQ-041, REQ-042, REQ-051
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/032_paid_nights_locked.sql');
const CHECK = resolve(process.cwd(), 'supabase/checks/032_paid_nights_locked_check.sql');

// The SQL with comments removed, whitespace collapsed, lower case.
const code = (path) => readFileSync(path, 'utf8')
  .split('\n').map((line) => line.replace(/--.*$/, '')).join(' ')
  .replace(/\s+/g, ' ').toLowerCase();

// One function's definition, from its CREATE to its closing `$$;`.
const fn = (sql, name) => {
  const start = sql.indexOf(`function ${name}() returns trigger`);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe.skipIf(!existsSync(MIGRATION))('migration 032: paid nights locked, payments kept (#389)', () => {
  const sql = existsSync(MIGRATION) ? code(MIGRATION) : '';

  it('runs in one transaction, and stops before changing anything if a night has two assignments or a paid night is someone else\'s', () => {
    expect(sql.trim().startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
    const firstChange = sql.indexOf('create unique index');
    expect(sql.indexOf('group by date having count(*) > 1')).toBeLessThan(firstChange);
    expect(sql.indexOf('na.employee_id is distinct from p.employee_id')).toBeLessThan(firstChange);
  });

  it('one assignment per night', () => {
    expect(sql).toContain('create unique index if not exists night_assignments_one_per_night on night_assignments (date);');
  });

  it('an employee with any payment cannot be deleted; one without takes their nights along', () => {
    expect(sql).toContain('add constraint payments_employee_id_fkey foreign key (employee_id) references employees(id) on delete restrict;');
    expect(sql).toContain('add constraint night_assignments_employee_id_fkey foreign key (employee_id) references employees(id) on delete cascade;');
  });

  it('payments gain the soft-delete columns, with no FK on who (a removed user keeps their history)', () => {
    for (const col of ['add column deleted_at timestamptz', 'add column deleted_by uuid,', 'add column deleted_by_email text',
      'add column delete_note text', "add column following_day_nights date[] not null default '{}'"]) {
      expect(sql).toContain(col);
    }
    expect(sql).not.toMatch(/deleted_by uuid references/);
  });

  it('a payment must match its nights: same employee, same "worked following day" ticks, locked in night order', () => {
    const body = fn(sql, 'payment_fill_nights');
    expect(body).toContain('new.employee_id is null');
    expect(body).toContain("coalesce(new.following_day_nights, '{}') <@ new.dates");
    expect(body).toMatch(/from night_assignments na where na\.date = any \(new\.dates\) order by na\.date for share/);
    expect(body).toContain('a.employee_id is distinct from new.employee_id');
    expect(body).toContain('coalesce(a.worked_following_day, false) <> (a.date = any (new.following_day_nights))');
    expect(body).toContain('matched <> cardinality(new.dates)');
    expect(body.match(/errcode = 'qb002'/g)).toHaveLength(3);
    // The checks come before the nights are written.
    expect(body.lastIndexOf('raise exception')).toBeLessThan(body.indexOf('insert into payment_nights'));
  });

  it('a new payment cannot arrive already deleted', () => {
    expect(fn(sql, 'payment_fill_nights')).toContain('new.deleted_at is not null or new.deleted_by is not null');
  });

  it('031\'s update rule is replaced by one that allows only the soft delete', () => {
    expect(sql).toContain('drop trigger payments_amounts_fixed on payments;');
    expect(sql).toContain('drop function payment_amounts_fixed();');
    expect(sql).toContain('create trigger payments_update_rules before update on payments for each row execute function payment_update_rules();');
    const body = fn(sql, 'payment_update_rules');
    expect(body).toContain("delete_cols constant text[] := array['deleted_at', 'deleted_by', 'deleted_by_email', 'delete_note']");
    expect(body).toContain('(to_jsonb(new) - delete_cols) is distinct from (to_jsonb(old) - delete_cols)');
  });

  it('a deleted payment cannot be changed or restored', () => {
    const body = fn(sql, 'payment_update_rules');
    expect(body.indexOf('if old.deleted_at is not null then raise exception')).toBeGreaterThan(-1);
    expect(body.indexOf('if old.deleted_at is not null')).toBeLessThan(body.indexOf('to_jsonb(new)'));
  });

  it('the database, not the client, sets when and who', () => {
    const body = fn(sql, 'payment_update_rules');
    expect(body).toContain('new.deleted_at := now();');
    expect(body).toContain('new.deleted_by := auth.uid();');
    expect(body).toContain("new.deleted_by_email := auth.jwt() ->> 'email';");
    expect(body).toContain("coalesce(btrim(new.deleted_by_email), '') = ''");
  });

  it('deleting releases the nights, once, as the table owner', () => {
    expect(sql).toMatch(/create function payment_release_nights\(\) returns trigger language plpgsql security definer set search_path = public, pg_temp/);
    expect(sql).toContain('delete from payment_nights where payment_id = new.id;');
    expect(sql).toContain('after update on payments for each row when (old.deleted_at is null and new.deleted_at is not null) execute function payment_release_nights();');
  });

  it('a hard delete is refused for every role', () => {
    expect(sql).toContain('create trigger payments_no_hard_delete before delete on payments for each row execute function payment_no_hard_delete();');
    expect(fn(sql, 'payment_no_hard_delete')).toContain("raise exception using errcode = 'qb003'");
    expect(sql).toContain('revoke delete, truncate on payments from anon, authenticated;');
    expect(sql).toContain('revoke truncate on night_assignments from anon, authenticated;');
  });

  it('a paid night is locked: delete, reassign, re-date and "worked following day" refused', () => {
    expect(sql).toContain('create trigger night_assignments_paid_lock before update or delete on night_assignments for each row execute function night_paid_lock();');
    expect(sql).toMatch(/create function night_paid_lock\(\) returns trigger language plpgsql volatile security definer set search_path = public, pg_temp/);
    const body = fn(sql, 'night_paid_lock');
    expect(body).toContain('select 1 from payment_nights where night = old.date');
    for (const col of ['date', 'employee_id']) {
      expect(body).toContain(`new.${col} is distinct from old.${col}`);
    }
    // null and false pay the same, as payment_fill_nights reads them
    expect(body).toContain('coalesce(new.worked_following_day, false) is distinct from coalesce(old.worked_following_day, false)');
    expect(body.match(/errcode = 'qb001'/g)).toHaveLength(2);
  });

  it('every new function is not callable directly', () => {
    for (const f of ['payment_fill_nights', 'payment_update_rules', 'payment_release_nights', 'payment_no_hard_delete', 'night_paid_lock']) {
      expect(sql).toContain(`revoke execute on function ${f}() from public;`);
    }
  });

  it('custom error codes avoid PostgREST\'s PT prefix (read as HTTP statuses)', () => {
    expect(sql).not.toMatch(/errcode = 'pt/);
  });

  it('reloads the API schema so the new columns are visible at once', () => {
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });
});

describe.skipIf(!existsSync(CHECK))('check script for 032', () => {
  const sql = existsSync(CHECK) ? code(CHECK) : '';

  it('runs as a signed-in user with a synthetic id and email, and always ends in an error that rolls back', () => {
    expect(sql).toContain('set local role authenticated;');
    expect(sql).toContain('check@example.invalid');
    expect(sql).not.toMatch(/\b(begin|commit|rollback);/);
    expect(sql.trim()).toMatch(/raise exception e'check 032: % \(rolled back\)\\n%', case when failed = 0 then 'all pass' else 'some failed \(' \|\| failed \|\| '\)' end, report; end; \$\$;$/);
  });

  it('covers every rule', () => {
    for (const name of ['matching payment saves', 'cannot be reassigned', 'cannot change', 'moved to another date',
      'cannot be cleared', 'second assignment', 'unpaid night can still be edited', 'assigned to someone else',
      'no assignment', 'ticked: refused', 'tick the night does not have', 'with the tick it has', 'no employee',
      'arrive already deleted', 'live payment cannot be edited', 'note alone', 'cannot hard-delete', 'can delete a payment',
      'frees its nights', 'database\'\'s time', 'signed-in user, not what the client sent', 'trimmed', 'cannot be restored',
      'note cannot be changed', 'paid again', 'only a deleted payment', 'live payment cannot be deleted', 'with their nights',
      'truncate payments', 'truncate night_assignments', 'even for postgres', 'without an email', 'names who works']) {
      expect(sql).toContain(name);
    }
  });

  it('its nights are all in 2099', () => {
    const nights = sql.match(/'\d{4}-\d{2}-\d{2}'::date|\('\d{4}-\d{2}-\d{2}', emp/g) ?? [];
    expect(nights.length).toBeGreaterThan(0);
    expect(nights.every((d) => d.includes("'2099-"))).toBe(true);
  });
});
