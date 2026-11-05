-- Migration 031: each paid night stored once, with its own amount (#370, REQ-041, ADR-011)
--
-- A payment row now carries `night_amounts` ({"2026-10-16": 139.75, ...}). An AFTER INSERT trigger
-- checks it against the row and writes one `payment_nights` row per night, in the same transaction.
-- `payment_nights.night` is the primary key, so a night that's already paid makes the whole insert
-- fail with 23505 and no payment row survives: a double-click, a second tab or a direct write can't
-- pay a night twice. Deleting a payment deletes its nights (they return to Outstanding).
--
-- Order: run this BEFORE merging the #370 PR, then the check script
-- (supabase/checks/031_payment_nights_check.sql). Don't pay anyone until check:deploy is OK and the
-- Payroll page has been reloaded: an old tab's insert is refused (no night_amounts) and looks saved.
--
-- First, the checks (stop if either is wrong):
--   SELECT count(*) FROM payments;                                   -- expect 0
--   SELECT data_type, udt_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'dates';
--                                                                     -- expect ARRAY, _date
--
-- Undo (then revert the code). Only safe while no real payment depends on it:
--   DROP TRIGGER payments_fill_nights ON payments;
--   DROP TRIGGER payments_amounts_fixed ON payments;
--   DROP FUNCTION payment_fill_nights(); DROP FUNCTION payment_amounts_fixed();
--   DROP TABLE payment_nights;
--   ALTER TABLE payments DROP COLUMN night_amounts;
--
-- Drift check, any time after (expect 0 rows): a payment whose nights don't match payment_nights.
--   SELECT p.id FROM payments p
--   LEFT JOIN (SELECT payment_id, count(*) AS n, sum(amount) AS total FROM payment_nights GROUP BY payment_id) pn
--     ON pn.payment_id = p.id
--   WHERE pn.payment_id IS NULL OR pn.n <> cardinality(p.dates) OR pn.total <> p.amount;
--
-- @requirements REQ-041

BEGIN;

-- NOT NULL with no default: fails loudly if any payment row exists (there are none to backfill).
ALTER TABLE payments ADD COLUMN night_amounts jsonb NOT NULL;

CREATE TABLE payment_nights (
  night       date           PRIMARY KEY,
  payment_id  uuid           NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  amount      numeric(10,2)  NOT NULL CHECK (amount >= 0)
);
CREATE INDEX idx_payment_nights_payment ON payment_nights(payment_id);

-- Signed-in users read; nobody writes except the trigger below.
ALTER TABLE payment_nights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read" ON payment_nights
  FOR SELECT USING (auth.role() = 'authenticated');
REVOKE ALL ON payment_nights FROM anon, authenticated;
GRANT SELECT ON payment_nights TO authenticated;

-- Checks the new payment row, then writes its nights. PL/pgSQL skips an IF whose test is NULL, so
-- every test is written to be true or false, never NULL (IS DISTINCT FROM, coalesce).
CREATE FUNCTION payment_fill_nights() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  night_keys text[];
  night_dates text[];
  bad_values integer;
  total numeric;
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

  -- CASE, not OR: SQL doesn't promise OR stops early, and casting a non-number would raise a
  -- less helpful error.
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

CREATE TRIGGER payments_fill_nights
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION payment_fill_nights();

-- Nothing in the app edits a payment: a mistake is fixed by Delete and pay again. Deleting an
-- employee (employee_id set to NULL) still works. #389 and #343 change this on purpose later.
CREATE FUNCTION payment_amounts_fixed() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.dates IS DISTINCT FROM OLD.dates
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.night_amounts IS DISTINCT FROM OLD.night_amounts
     OR NEW.nights IS DISTINCT FROM OLD.nights THEN
    RAISE EXCEPTION 'payment %: a payment''s nights and amounts cannot be changed; delete it and pay again', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION payment_amounts_fixed() FROM PUBLIC;

CREATE TRIGGER payments_amounts_fixed
  BEFORE UPDATE OF dates, amount, night_amounts, nights ON payments
  FOR EACH ROW EXECUTE FUNCTION payment_amounts_fixed();

COMMIT;

NOTIFY pgrst, 'reload schema';
