-- Migration 032: paid nights are locked; deleted payments are kept as history (#389, REQ-041,
-- REQ-042, REQ-051, ADR-012). #323's planned migration becomes 033.
--
-- 1. One night assignment per night (unique index on date).
-- 2. A night with a live payment can't be cleared, reassigned, re-dated or have its
--    "worked following day" changed (trigger on night_assignments, SQLSTATE QB001).
-- 3. A payment is refused unless each night is assigned to the person paid, with the same
--    "worked following day" ticks the page priced it with (payment_fill_nights, SQLSTATE QB002).
-- 4. Deleting a payment is a soft delete (deleted_at, who, optional note): its nights are released
--    and can be paid again. A deleted payment can't be changed or restored, a live one can't be
--    edited, and a hard delete is refused for every role (SQLSTATE QB003).
-- 5. An employee with any payment, live or deleted, can't be deleted (FK RESTRICT); deleting one
--    with no payments removes their night assignments in the same statement (FK CASCADE).
--
-- Order: run this BEFORE merging the #389 PR, then BOTH check scripts:
--   supabase/checks/031_payment_nights_check.sql     -> "check 031: ALL PASS (rolled back)"
--   supabase/checks/032_paid_nights_locked_check.sql -> "check 032: ALL PASS (rolled back)"
-- Then merge, check:deploy, and reload every open Payroll and calendar tab.
--
-- The migration stops itself (and changes nothing) if either pre-check below fails:
--   (a) a night has two assignments:
--       SELECT date, count(*) FROM night_assignments GROUP BY date HAVING count(*) > 1;
--   (b) a payment's night isn't assigned to the person it paid:
--       SELECT p.id, d FROM payments p CROSS JOIN unnest(p.dates) AS d
--       LEFT JOIN night_assignments na ON na.date = d
--       WHERE na.employee_id IS DISTINCT FROM p.employee_id;
--
-- FK actions before and after (the old names are found, not assumed):
--   SELECT conrelid::regclass, conname, confdeltype FROM pg_constraint
--   WHERE contype = 'f' AND confrelid = 'public.employees'::regclass;
--   -- after: night_assignments c (cascade), payments r (restrict)
--
-- Deleting a payment by hand (SQL editor; auth.uid() is NULL there, so say who):
--   UPDATE payments SET deleted_at = now(), deleted_by_email = 'you@…', delete_note = 'why'
--   WHERE id = '…';
--
-- Emergency hard delete (test data only; never a real payment):
--   BEGIN; ALTER TABLE payments DISABLE TRIGGER payments_no_hard_delete;
--   DELETE FROM payments WHERE id = '…';
--   ALTER TABLE payments ENABLE TRIGGER payments_no_hard_delete; COMMIT;
--
-- Drift check, any time after (expect 0 rows): a live payment whose nights don't match
-- payment_nights, or a deleted one that still holds nights.
--   SELECT p.id FROM payments p
--   LEFT JOIN (SELECT payment_id, count(*) AS n FROM payment_nights GROUP BY payment_id) pn
--     ON pn.payment_id = p.id
--   WHERE (p.deleted_at IS NULL AND coalesce(pn.n, 0) <> cardinality(p.dates))
--      OR (p.deleted_at IS NOT NULL AND pn.n IS NOT NULL);
--
-- Undo (then revert the code). Only safe while no payment has been soft-deleted:
--   DROP TRIGGER night_assignments_paid_lock ON night_assignments; DROP FUNCTION night_paid_lock();
--   DROP TRIGGER payments_update_rules ON payments; DROP FUNCTION payment_update_rules();
--   DROP TRIGGER payments_release_nights ON payments; DROP FUNCTION payment_release_nights();
--   DROP TRIGGER payments_no_hard_delete ON payments; DROP FUNCTION payment_no_hard_delete();
--   ALTER TABLE payments DROP COLUMN deleted_at, DROP COLUMN deleted_by,
--     DROP COLUMN deleted_by_email, DROP COLUMN delete_note, DROP COLUMN following_day_nights;
--   then re-run 031's payment_fill_nights and payment_amounts_fixed definitions, and put the
--   FKs back as they were (see the query above).
--
-- @requirements REQ-041, REQ-042, REQ-051

BEGIN;

-- Pre-check (a): one assignment per night.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM night_assignments GROUP BY date HAVING count(*) > 1) THEN
    RAISE EXCEPTION '032 pre-check failed: a night has two assignments (see the query at the top). Nothing was changed.';
  END IF;
END;
$$;

-- Pre-check (b): every payment's nights are assigned to the person it paid.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payments p CROSS JOIN unnest(p.dates) AS d
    LEFT JOIN night_assignments na ON na.date = d
    WHERE na.employee_id IS DISTINCT FROM p.employee_id
  ) THEN
    RAISE EXCEPTION '032 pre-check failed: a paid night is assigned to someone else (see the query at the top). Nothing was changed.';
  END IF;
END;
$$;

-- 1. One assignment per night.
CREATE UNIQUE INDEX night_assignments_one_per_night ON night_assignments (date);

-- 5. Employee delete: RESTRICT on payments, CASCADE on night assignments. Production's current
-- constraint names and actions aren't known for sure, so drop whatever FKs point at employees from
-- these two columns, then add them back by name.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS tbl
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.employees'::regclass
      AND con.conrelid IN ('public.night_assignments'::regclass, 'public.payments'::regclass)
      AND att.attname = 'employee_id'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END;
$$;
ALTER TABLE night_assignments ADD CONSTRAINT night_assignments_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE payments ADD CONSTRAINT payments_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

-- 4. Soft-delete columns, and 3. the nights the page priced with "worked following day".
-- deleted_by has no FK: removing a user must not be blocked by the history they left.
ALTER TABLE payments
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid,
  ADD COLUMN deleted_by_email text,
  ADD COLUMN delete_note text,
  ADD COLUMN following_day_nights date[] NOT NULL DEFAULT '{}';

-- 3. payment_fill_nights (031) gains: a new payment is live, has an employee, and each night is
-- assigned to that employee with the ticks it was priced with. The assignments are locked FOR SHARE
-- in night order, so a reassignment in flight either finishes first (and this refuses) or waits
-- and is then refused by the night lock. Everything else is as in 031.
CREATE OR REPLACE FUNCTION payment_fill_nights() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  night_keys text[];
  night_dates text[];
  bad_values integer;
  total numeric;
  a record;
  matched integer := 0;
BEGIN
  IF jsonb_typeof(NEW.night_amounts) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'payment %: night_amounts must be an object of night -> amount', NEW.id;
  END IF;

  IF coalesce(cardinality(NEW.dates), 0) = 0 THEN
    RAISE EXCEPTION 'payment %: no nights', NEW.id;
  END IF;

  IF cardinality(NEW.dates) <> (SELECT count(DISTINCT d) FROM unnest(NEW.dates) AS d) THEN
    RAISE EXCEPTION 'payment %: a night is listed twice', NEW.id;
  END IF;

  IF NEW.nights IS DISTINCT FROM cardinality(NEW.dates) THEN
    RAISE EXCEPTION 'payment %: nights (%) does not match the dates (%)', NEW.id, NEW.nights, cardinality(NEW.dates);
  END IF;

  SELECT array_agg(k ORDER BY k) INTO night_keys FROM jsonb_object_keys(NEW.night_amounts) AS k;
  SELECT array_agg(to_char(d, 'YYYY-MM-DD') ORDER BY d) INTO night_dates FROM unnest(NEW.dates) AS d;
  IF night_keys IS DISTINCT FROM night_dates THEN
    RAISE EXCEPTION 'payment %: night_amounts nights do not match the dates', NEW.id;
  END IF;

  SELECT count(*) INTO bad_values
  FROM jsonb_each(NEW.night_amounts) AS e(k, v)
  WHERE CASE WHEN jsonb_typeof(v) = 'number'
             THEN (v #>> '{}')::numeric < 0 OR (v #>> '{}')::numeric <> round((v #>> '{}')::numeric, 2)
             ELSE true END;
  IF bad_values > 0 THEN
    RAISE EXCEPTION 'payment %: each night amount must be a whole number of cents, not negative', NEW.id;
  END IF;

  SELECT sum((v #>> '{}')::numeric) INTO total FROM jsonb_each(NEW.night_amounts) AS e(k, v);
  IF total IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'payment %: night amounts add up to %, not the payment amount %', NEW.id, total, NEW.amount;
  END IF;

  -- #389 from here.
  IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL
     OR NEW.deleted_by_email IS NOT NULL OR NEW.delete_note IS NOT NULL THEN
    RAISE EXCEPTION 'payment %: a new payment cannot be marked deleted', NEW.id;
  END IF;

  IF NEW.employee_id IS NULL THEN
    RAISE EXCEPTION 'payment %: no employee', NEW.id;
  END IF;

  IF NOT (coalesce(NEW.following_day_nights, '{}') <@ NEW.dates) THEN
    RAISE EXCEPTION 'payment %: following_day_nights must be among the payment''s nights', NEW.id;
  END IF;

  FOR a IN
    SELECT na.date, na.employee_id, na.worked_following_day
    FROM night_assignments na
    WHERE na.date = ANY (NEW.dates)
    ORDER BY na.date
    FOR SHARE
  LOOP
    matched := matched + 1;
    IF a.employee_id IS DISTINCT FROM NEW.employee_id THEN
      RAISE EXCEPTION USING ERRCODE = 'QB002',
        MESSAGE = format('payment %s: the night %s is no longer assigned to this employee', NEW.id, a.date);
    END IF;
    IF coalesce(a.worked_following_day, false) <> (a.date = ANY (NEW.following_day_nights)) THEN
      RAISE EXCEPTION USING ERRCODE = 'QB002',
        MESSAGE = format('payment %s: "worked following day" changed for the night %s', NEW.id, a.date);
    END IF;
  END LOOP;
  IF matched <> cardinality(NEW.dates) THEN
    RAISE EXCEPTION USING ERRCODE = 'QB002',
      MESSAGE = format('payment %s: a night has no assignment', NEW.id);
  END IF;

  -- In night order, so two overlapping payments lock rows in the same order (no deadlock).
  -- A night already paid raises unique_violation (23505) and the whole insert rolls back.
  INSERT INTO payment_nights (night, payment_id, amount)
  SELECT d, NEW.id, (NEW.night_amounts ->> to_char(d, 'YYYY-MM-DD'))::numeric
  FROM unnest(NEW.dates) AS d
  ORDER BY d;

  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION payment_fill_nights() FROM PUBLIC;

-- 4. Updates: replaces 031's payments_amounts_fixed. The only change a payment accepts is its soft
-- delete; every other column is compared as a whole, so a column added later is locked too.
DROP TRIGGER payments_amounts_fixed ON payments;
DROP FUNCTION payment_amounts_fixed();

CREATE FUNCTION payment_update_rules() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  delete_cols constant text[] := ARRAY['deleted_at', 'deleted_by', 'deleted_by_email', 'delete_note'];
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'QB003',
      MESSAGE = format('payment %s was deleted: a deleted payment can''t be changed or restored. Pay again instead.', OLD.id);
  END IF;

  IF (to_jsonb(NEW) - delete_cols) IS DISTINCT FROM (to_jsonb(OLD) - delete_cols) THEN
    RAISE EXCEPTION USING ERRCODE = 'QB003',
      MESSAGE = format('payment %s: a payment can''t be changed; delete it and pay again', OLD.id);
  END IF;

  IF NEW.deleted_at IS NULL THEN
    IF NEW.deleted_by IS NOT NULL OR NEW.deleted_by_email IS NOT NULL OR NEW.delete_note IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'QB003',
        MESSAGE = format('payment %s: who and why can only be set when deleting it', OLD.id);
    END IF;
    RETURN NEW;
  END IF;

  -- The soft delete. The client can't choose the time or who: both come from the database.
  NEW.deleted_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.deleted_by := auth.uid();
    NEW.deleted_by_email := auth.jwt() ->> 'email';
  ELSE
    NEW.deleted_by := NULL;  -- SQL editor or service key: the caller names themselves by email
  END IF;
  IF coalesce(btrim(NEW.deleted_by_email), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'QB003',
      MESSAGE = format('payment %s: who deleted it is unknown; set deleted_by_email', OLD.id);
  END IF;
  NEW.delete_note := nullif(btrim(NEW.delete_note), '');
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION payment_update_rules() FROM PUBLIC;

CREATE TRIGGER payments_update_rules
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payment_update_rules();

-- A deleted payment releases its nights: they can be edited and paid again. The payment keeps its
-- dates and night_amounts for the history.
CREATE FUNCTION payment_release_nights() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM payment_nights WHERE payment_id = NEW.id;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION payment_release_nights() FROM PUBLIC;

CREATE TRIGGER payments_release_nights
  AFTER UPDATE ON payments
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION payment_release_nights();

-- Hard delete refused for every role, the service key and the SQL editor included.
CREATE FUNCTION payment_no_hard_delete() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'QB003',
    MESSAGE = format('payment %s: payments are never deleted outright; delete it in the app (it is kept as history)', OLD.id);
END;
$$;
REVOKE EXECUTE ON FUNCTION payment_no_hard_delete() FROM PUBLIC;

CREATE TRIGGER payments_no_hard_delete
  BEFORE DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payment_no_hard_delete();

-- 2. Paid nights locked. SECURITY DEFINER so the lookup can't fail open if who may read
-- payment_nights is narrowed later; VOLATILE (the default) so, after waiting on a payment's lock,
-- it reads the committed payment_nights. A new row on a paid night is already refused by the
-- unique index (a paid night always has its assignment).
CREATE FUNCTION night_paid_lock() RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_nights WHERE night = OLD.date) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Separate branches: NEW is NULL on DELETE.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'QB001',
      MESSAGE = format('The night %s is paid. Delete the payment to change it.', OLD.date);
  END IF;
  IF NEW.date IS DISTINCT FROM OLD.date
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.worked_following_day IS DISTINCT FROM OLD.worked_following_day THEN
    RAISE EXCEPTION USING ERRCODE = 'QB001',
      MESSAGE = format('The night %s is paid. Delete the payment to change it.', OLD.date);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION night_paid_lock() FROM PUBLIC;

CREATE TRIGGER night_assignments_paid_lock
  BEFORE UPDATE OR DELETE ON night_assignments
  FOR EACH ROW EXECUTE FUNCTION night_paid_lock();

-- Grants: the app never hard-deletes a payment; row triggers don't fire on TRUNCATE.
REVOKE DELETE, TRUNCATE ON payments FROM anon, authenticated;
REVOKE TRUNCATE ON night_assignments FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
