-- Check for migration 032 (#389). Run it in the Supabase SQL editor AFTER the migration, as one run,
-- and after 031's check (which must also read ALL PASS).
-- It runs as a signed-in user with a synthetic id and email (the SQL editor is `postgres`, which
-- skips RLS), on 2099 nights, then a few cases as `postgres` itself.
--
-- It ALWAYS ends in an error, on purpose: the error rolls everything back (nothing is left behind)
-- and its message is the result, since the editor shows only the last statement. Expect:
--   ERROR: check 032: ALL PASS (rolled back)
-- followed by one line per case. "SOME FAILED" means stop: don't merge. There is no BEGIN: the
-- editor runs the script as one implicit transaction, which an error rolls back whole.
--
-- @requirements REQ-041, REQ-042, REQ-051

CREATE TEMP TABLE check_032 (n serial, name text, outcome text) ON COMMIT DROP;
GRANT ALL ON check_032 TO authenticated, anon;
GRANT USAGE ON SEQUENCE check_032_n_seq TO authenticated, anon;

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000032","email":"check@example.invalid"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  emp uuid;      -- paid on 06-15, 06-16 and 06-17
  emp2 uuid;     -- assigned 06-18
  emp3 uuid;     -- only a deleted payment
  emp4 uuid;     -- no payments at all
  pay uuid;
  pay2 uuid;
  rows_now integer;
  state text;
  p payments%ROWTYPE;
BEGIN
  INSERT INTO employees (name, active) VALUES ('zz-check-032-a', true) RETURNING id INTO emp;
  INSERT INTO employees (name, active) VALUES ('zz-check-032-b', true) RETURNING id INTO emp2;
  INSERT INTO employees (name, active) VALUES ('zz-check-032-c', true) RETURNING id INTO emp3;
  INSERT INTO employees (name, active) VALUES ('zz-check-032-d', true) RETURNING id INTO emp4;
  INSERT INTO night_assignments (date, employee_id, worked_following_day) VALUES
    ('2099-06-15', emp, NULL), ('2099-06-16', emp, NULL), ('2099-06-17', emp, true),
    ('2099-06-18', emp2, NULL), ('2099-06-19', emp, NULL), ('2099-06-20', emp3, NULL), ('2099-06-21', emp4, NULL);

  -- 1. A payment that matches its nights saves.
  INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
  VALUES (emp, 200, 2, ARRAY['2099-06-15', '2099-06-16']::date[], '2099-06-22',
          '{"2099-06-15": 100, "2099-06-16": 100}')
  RETURNING id INTO pay;
  SELECT count(*) INTO rows_now FROM payment_nights WHERE payment_id = pay;
  INSERT INTO check_032 (name, outcome) VALUES ('1 a matching payment saves its 2 nights',
    CASE WHEN rows_now = 2 THEN 'PASS' ELSE 'FAIL: ' || rows_now END);

  -- 2. A paid night can't be reassigned, re-ticked, re-dated or cleared (QB001).
  BEGIN
    UPDATE night_assignments SET employee_id = emp2 WHERE date = '2099-06-16';
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('2a a paid night cannot be reassigned (QB001)',
    CASE WHEN state = 'QB001' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    UPDATE night_assignments SET worked_following_day = true WHERE date = '2099-06-16';
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('2b a paid night''s "worked following day" cannot change (QB001)',
    CASE WHEN state = 'QB001' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    UPDATE night_assignments SET date = '2099-06-30' WHERE date = '2099-06-16';
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('2c a paid night cannot be moved to another date (QB001)',
    CASE WHEN state = 'QB001' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    DELETE FROM night_assignments WHERE date = '2099-06-16';
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('2d a paid night cannot be cleared (QB001)',
    CASE WHEN state = 'QB001' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 3. One assignment per night: a second row for a night is refused (unique index).
  BEGIN
    INSERT INTO night_assignments (date, employee_id) VALUES ('2099-06-15', emp2);
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('3 a second assignment for a night is refused (23505)',
    CASE WHEN state = '23505' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 4. An unpaid night still changes freely.
  BEGIN
    UPDATE night_assignments SET worked_following_day = true WHERE date = '2099-06-18';
    UPDATE night_assignments SET worked_following_day = NULL WHERE date = '2099-06-18';
    state := 'ok';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('4 an unpaid night can still be edited',
    CASE WHEN state = 'ok' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 5. A payment must match the nights (QB002).
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp, 50, 1, ARRAY['2099-06-18']::date[], '2099-06-22', '{"2099-06-18": 50}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('5a paying a night assigned to someone else is refused (QB002)',
    CASE WHEN state = 'QB002' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp, 50, 1, ARRAY['2099-06-24']::date[], '2099-06-22', '{"2099-06-24": 50}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('5b paying a night with no assignment is refused (QB002)',
    CASE WHEN state = 'QB002' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp, 50, 1, ARRAY['2099-06-17']::date[], '2099-06-22', '{"2099-06-17": 50}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('5c priced without a "worked following day" that is ticked: refused (QB002)',
    CASE WHEN state = 'QB002' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts, following_day_nights)
    VALUES (emp, 50, 1, ARRAY['2099-06-19']::date[], '2099-06-22', '{"2099-06-19": 50}', ARRAY['2099-06-19']::date[]);
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  -- 06-19 is the payee's own night with no tick, so only the tick comparison can refuse it.
  INSERT INTO check_032 (name, outcome) VALUES ('5d priced with a tick the night does not have: refused (QB002)',
    CASE WHEN state = 'QB002' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts, following_day_nights)
    VALUES (emp, 50, 1, ARRAY['2099-06-17']::date[], '2099-06-22', '{"2099-06-17": 50}', ARRAY['2099-06-17']::date[]);
    state := 'ok';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('5e priced with the tick it has: saves',
    CASE WHEN state = 'ok' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    INSERT INTO payments (amount, nights, dates, paid_date, night_amounts)
    VALUES (50, 1, ARRAY['2099-06-21']::date[], '2099-06-22', '{"2099-06-21": 50}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('5f a payment with no employee is refused',
    CASE WHEN state = 'P0001' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts, deleted_at, deleted_by_email)
    VALUES (emp4, 50, 1, ARRAY['2099-06-21']::date[], '2099-06-22', '{"2099-06-21": 50}', now(), 'x@example.invalid');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('5g a new payment cannot arrive already deleted',
    CASE WHEN state = 'P0001' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 6. A live payment can't be edited, and can't be hard-deleted by a signed-in user.
  BEGIN
    UPDATE payments SET notes = 'changed' WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('6a a live payment cannot be edited (QB003)',
    CASE WHEN state = 'QB003' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    UPDATE payments SET delete_note = 'no delete' WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('6b a note alone (without deleting) is refused (QB003)',
    CASE WHEN state = 'QB003' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    DELETE FROM payments WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('6c a signed-in user cannot hard-delete a payment (42501)',
    CASE WHEN state = '42501' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 7. Soft delete: time and who come from the database, the note is trimmed, the nights are freed.
  BEGIN
    UPDATE payments
    SET deleted_at = '2000-01-01', deleted_by = gen_random_uuid(), deleted_by_email = 'forged@example.invalid',
        delete_note = '  wrong night  '
    WHERE id = pay;
    state := 'ok';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('7 a signed-in user can delete a payment',
    CASE WHEN state = 'ok' THEN 'PASS' ELSE 'FAIL: ' || state END);
  SELECT * INTO p FROM payments WHERE id = pay;
  SELECT count(*) INTO rows_now FROM payment_nights WHERE payment_id = pay;
  INSERT INTO check_032 (name, outcome) VALUES ('7a soft delete keeps the row and frees its nights',
    CASE WHEN p.id IS NOT NULL AND rows_now = 0 AND cardinality(p.dates) = 2 THEN 'PASS'
         ELSE 'FAIL: ' || rows_now || ' nights' END);
  INSERT INTO check_032 (name, outcome) VALUES ('7b deleted_at is the database''s time, not the client''s',
    CASE WHEN p.deleted_at > '2026-01-01' THEN 'PASS' ELSE 'FAIL: ' || p.deleted_at END);
  INSERT INTO check_032 (name, outcome) VALUES ('7c who is the signed-in user, not what the client sent',
    CASE WHEN p.deleted_by = '00000000-0000-4000-8000-000000000032' AND p.deleted_by_email = 'check@example.invalid'
         THEN 'PASS' ELSE 'FAIL: ' || coalesce(p.deleted_by::text, 'null') || ' ' || coalesce(p.deleted_by_email, 'null') END);
  INSERT INTO check_032 (name, outcome) VALUES ('7d the note is kept, trimmed',
    CASE WHEN p.delete_note = 'wrong night' THEN 'PASS' ELSE 'FAIL: ' || coalesce(p.delete_note, 'null') END);

  -- 8. A deleted payment can't be restored or changed.
  BEGIN
    UPDATE payments SET deleted_at = NULL WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('8a a deleted payment cannot be restored (QB003)',
    CASE WHEN state = 'QB003' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    UPDATE payments SET delete_note = 'edited later' WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('8b a deleted payment''s note cannot be changed (QB003)',
    CASE WHEN state = 'QB003' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 9. Released nights can be edited and paid again.
  BEGIN
    UPDATE night_assignments SET employee_id = emp2 WHERE date = '2099-06-16';
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp2, 100, 1, ARRAY['2099-06-16']::date[], '2099-06-23', '{"2099-06-16": 100}')
    RETURNING id INTO pay2;
    state := 'ok';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('9 a freed night can be reassigned and paid again',
    CASE WHEN state = 'ok' AND (SELECT payment_id FROM payment_nights WHERE night = '2099-06-16') = pay2
         THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 10. Employees: any payment (even only a deleted one) blocks delete; none deletes with nights.
  INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
  VALUES (emp3, 30, 1, ARRAY['2099-06-20']::date[], '2099-06-22', '{"2099-06-20": 30}')
  RETURNING id INTO pay2;
  BEGIN
    UPDATE payments SET deleted_at = now() WHERE id = pay2;
    DELETE FROM employees WHERE id = emp3;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  SELECT count(*) INTO rows_now FROM night_assignments WHERE date = '2099-06-20';
  INSERT INTO check_032 (name, outcome) VALUES ('10a an employee with only a deleted payment cannot be deleted (23503)',
    CASE WHEN state = '23503' AND rows_now = 1 THEN 'PASS' ELSE 'FAIL: ' || state || ', ' || rows_now || ' nights' END);
  BEGIN
    DELETE FROM employees WHERE id = emp;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('10b an employee with a live payment cannot be deleted',
    CASE WHEN state IN ('23503', 'QB001') THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    DELETE FROM employees WHERE id = emp4;
    state := 'ok';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  SELECT count(*) INTO rows_now FROM night_assignments WHERE date = '2099-06-21';
  INSERT INTO check_032 (name, outcome) VALUES ('10c an employee with no payments deletes, with their nights',
    CASE WHEN state = 'ok' AND rows_now = 0 THEN 'PASS' ELSE 'FAIL: ' || state || ', ' || rows_now || ' nights' END);

  -- 11. TRUNCATE (which skips row triggers) is refused for signed-in users.
  BEGIN
    TRUNCATE payments CASCADE;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('11a signed-in user cannot TRUNCATE payments (42501)',
    CASE WHEN state = '42501' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    TRUNCATE night_assignments;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('11b signed-in user cannot TRUNCATE night_assignments (42501)',
    CASE WHEN state = '42501' THEN 'PASS' ELSE 'FAIL: ' || state END);
END;
$$;

-- 12. As `postgres` (the SQL editor, no signed-in user): hard delete is still refused, and a soft
-- delete must say who.
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
DO $$
DECLARE
  pay uuid;
  state text;
BEGIN
  SELECT id INTO pay FROM payments
  WHERE deleted_at IS NULL AND '2099-06-17' = ANY (dates);

  BEGIN
    DELETE FROM payments WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('12a hard delete refused even for postgres (QB003)',
    CASE WHEN state = 'QB003' THEN 'PASS' ELSE 'FAIL: ' || state END);

  BEGIN
    UPDATE payments SET deleted_at = now() WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_032 (name, outcome) VALUES ('12b a SQL-editor delete without an email is refused (QB003)',
    CASE WHEN state = 'QB003' THEN 'PASS' ELSE 'FAIL: ' || state END);

  UPDATE payments SET deleted_at = now(), deleted_by_email = 'check@example.invalid' WHERE id = pay;
  INSERT INTO check_032 (name, outcome) VALUES ('12c a SQL-editor delete that names who works',
    CASE WHEN (SELECT deleted_by_email FROM payments WHERE id = pay) = 'check@example.invalid'
          AND (SELECT deleted_by FROM payments WHERE id = pay) IS NULL
          AND NOT EXISTS (SELECT 1 FROM payment_nights WHERE payment_id = pay)
         THEN 'PASS' ELSE 'FAIL' END);
END;
$$;

-- The result, as an error, so it shows in the editor and rolls everything back.
DO $$
DECLARE
  failed integer;
  report text;
BEGIN
  SELECT count(*) FILTER (WHERE outcome <> 'PASS'),
         string_agg(n || '. ' || name || ': ' || outcome, E'\n' ORDER BY n)
  INTO failed, report FROM check_032;
  RAISE EXCEPTION E'check 032: % (rolled back)\n%',
    CASE WHEN failed = 0 THEN 'ALL PASS' ELSE 'SOME FAILED (' || failed || ')' END, report;
END;
$$;
