-- Check for migration 031 (#370). Run it in the Supabase SQL editor AFTER the migration.
-- It runs as a signed-in user (the SQL editor is `postgres`, which skips RLS), on 2099 dates, and
-- ROLLS BACK at the end: nothing is left behind. Expect every row in the result to say PASS.
--
-- @requirements REQ-041

BEGIN;

CREATE TEMP TABLE check_031 (n serial, name text, outcome text) ON COMMIT DROP;
GRANT ALL ON check_031 TO authenticated, anon;
GRANT USAGE ON SEQUENCE check_031_n_seq TO authenticated, anon;

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  emp uuid;
  pay uuid;
  rows_now integer;
  state text;
BEGIN
  INSERT INTO employees (name, active) VALUES ('zz-check-031', true) RETURNING id INTO emp;

  -- 1. A valid two-night payment writes two nights with their own amounts.
  INSERT INTO payments (employee_id, amount, start_date, end_date, nights, dates, paid_date, night_amounts)
  VALUES (emp, 318.50, '2099-01-15', '2099-01-16', 2, ARRAY['2099-01-15', '2099-01-16']::date[], '2099-01-20',
          '{"2099-01-15": 139.75, "2099-01-16": 178.75}')
  RETURNING id INTO pay;
  SELECT count(*) INTO rows_now FROM payment_nights WHERE payment_id = pay;
  INSERT INTO check_031 (name, outcome) VALUES ('1 valid payment writes its 2 nights',
    CASE WHEN rows_now = 2 AND (SELECT amount FROM payment_nights WHERE night = '2099-01-16') = 178.75
         THEN 'PASS' ELSE 'FAIL: ' || rows_now || ' nights' END);

  -- 2. A second payment for a paid night is refused with 23505, and no payment row survives.
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp, 139.75, 1, ARRAY['2099-01-16']::date[], '2099-01-20', '{"2099-01-16": 139.75}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  SELECT count(*) INTO rows_now FROM payments WHERE '2099-01-16' = ANY (dates);
  INSERT INTO check_031 (name, outcome) VALUES ('2 a paid night cannot be paid again (23505)',
    CASE WHEN state = '23505' AND rows_now = 1 THEN 'PASS' ELSE 'FAIL: ' || state || ', rows ' || rows_now END);

  -- 3. No night_amounts is refused.
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date)
    VALUES (emp, 10, 1, ARRAY['2099-02-01']::date[], '2099-02-02');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('3 missing night_amounts refused (23502)',
    CASE WHEN state = '23502' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 4. Night amounts that don't add up to the payment are refused.
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp, 100, 1, ARRAY['2099-02-01']::date[], '2099-02-02', '{"2099-02-01": 99.99}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('4 sum mismatch refused',
    CASE WHEN state = 'P0001' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 5. A night listed twice is refused.
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp, 20, 2, ARRAY['2099-02-01', '2099-02-01']::date[], '2099-02-02', '{"2099-02-01": 20}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('5 repeated night refused',
    CASE WHEN state = 'P0001' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 6. Amounts must be whole cents, and keys must be the payment's nights.
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp, 10.005, 1, ARRAY['2099-02-01']::date[], '2099-02-02', '{"2099-02-01": 10.005}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('6a part-cent amount refused',
    CASE WHEN state = 'P0001' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    INSERT INTO payments (employee_id, amount, nights, dates, paid_date, night_amounts)
    VALUES (emp, 10, 1, ARRAY['2099-02-01']::date[], '2099-02-02', '{"2099-02-02": 10}');
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('6b night_amounts for another night refused',
    CASE WHEN state = 'P0001' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 7. A signed-in user can read nights but not write them.
  SELECT count(*) INTO rows_now FROM payment_nights WHERE night BETWEEN '2099-01-01' AND '2099-12-31';
  INSERT INTO check_031 (name, outcome) VALUES ('7a signed-in user reads payment_nights',
    CASE WHEN rows_now = 2 THEN 'PASS' ELSE 'FAIL: ' || rows_now END);
  BEGIN
    INSERT INTO payment_nights (night, payment_id, amount) VALUES ('2099-03-01', pay, 1);
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('7b direct payment_nights insert refused (42501)',
    CASE WHEN state = '42501' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    DELETE FROM payment_nights WHERE payment_id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('7c direct payment_nights delete refused (42501)',
    CASE WHEN state = '42501' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 8. A payment's nights and amounts can't be changed.
  BEGIN
    UPDATE payments SET dates = ARRAY['2099-01-15']::date[] WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('8a update of dates refused',
    CASE WHEN state = 'P0001' THEN 'PASS' ELSE 'FAIL: ' || state END);
  BEGIN
    UPDATE payments SET amount = 1 WHERE id = pay;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('8b update of amount refused',
    CASE WHEN state = 'P0001' THEN 'PASS' ELSE 'FAIL: ' || state END);

  -- 9. Deleting the employee keeps the payment and its nights (employee_id goes NULL).
  DELETE FROM employees WHERE id = emp;
  SELECT count(*) INTO rows_now FROM payment_nights WHERE payment_id = pay;
  INSERT INTO check_031 (name, outcome) VALUES ('9 deleting the employee keeps the paid nights',
    CASE WHEN rows_now = 2 AND (SELECT employee_id FROM payments WHERE id = pay) IS NULL
         THEN 'PASS' ELSE 'FAIL: ' || rows_now || ' nights' END);

  -- 10. Deleting the payment frees its nights, and the night can then be paid again.
  DELETE FROM payments WHERE id = pay;
  SELECT count(*) INTO rows_now FROM payment_nights WHERE payment_id = pay;
  BEGIN
    INSERT INTO payments (amount, nights, dates, paid_date, night_amounts)
    VALUES (139.75, 1, ARRAY['2099-01-16']::date[], '2099-01-21', '{"2099-01-16": 139.75}');
    state := 'ok';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('10 delete frees the nights; the night can be paid again',
    CASE WHEN rows_now = 0 AND state = 'ok' THEN 'PASS' ELSE 'FAIL: ' || rows_now || ' nights, ' || state END);
END;
$$;

-- 11. Signed-out (anon) can't read paid nights.
SET LOCAL ROLE anon;
DO $$
DECLARE state text;
BEGIN
  BEGIN
    PERFORM count(*) FROM payment_nights;
    state := 'no error';
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  INSERT INTO check_031 (name, outcome) VALUES ('11 anon cannot read payment_nights (42501)',
    CASE WHEN state = '42501' THEN 'PASS' ELSE 'FAIL: ' || state END);
END;
$$;

RESET ROLE;
SELECT n, name, outcome FROM check_031 ORDER BY n;

ROLLBACK;
