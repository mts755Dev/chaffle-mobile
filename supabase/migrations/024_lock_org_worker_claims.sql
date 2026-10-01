-- =============================================================================
-- 024_lock_org_worker_claims.sql
-- SECURITY: user_metadata.role / organization_id are client-writable via
-- auth.updateUser. Privilege must come from DB ownership / worker rows.
--
-- Fixes:
--  1) is_org_admin_jwt() → true only if user owns an organization row
--  2) Confirm can_manage_raffle / is_worker_for_raffle stay DB-backed
--  3) ticket_pricing_ok + trigger so amount↔quantity cannot be unbound
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Org-admin JWT helper — DB ownership only (never JWT role string)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_admin_jwt()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization o
    WHERE o.owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin_jwt() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin_jwt() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Re-affirm can_manage_raffle / worker helpers are DB-backed (no JWT role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.owns_organization(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization o
    WHERE o.id = org_id AND o.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_worker_for_raffle(raffle uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.worker w
    WHERE w.user_id = auth.uid()
      AND w.raffle_id = raffle
      AND w.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_raffle(raffle uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin_jwt()
    OR public.is_worker_for_raffle(raffle)
    OR EXISTS (
      SELECT 1 FROM public.donation_form d
      WHERE d.id = raffle
        AND d.organization_id IS NOT NULL
        AND public.owns_organization(d.organization_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- 3) Ticket amount ↔ quantity binding (presets + custom > $250 → amount×3)
--    Free tickets: amount = 0 AND quantity = 1 only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticket_pricing_ok(
  p_amount numeric,
  p_quantity integer,
  p_is_free boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_is_free, false) THEN
      coalesce(p_amount, 0) = 0 AND coalesce(p_quantity, 0) = 1
    WHEN p_amount = 5 AND p_quantity = 1 THEN true
    WHEN p_amount = 10 AND p_quantity = 3 THEN true
    WHEN p_amount = 20 AND p_quantity = 10 THEN true
    WHEN p_amount = 40 AND p_quantity = 40 THEN true
    WHEN p_amount = 100 AND p_quantity = 200 THEN true
    WHEN p_amount = 250 AND p_quantity = 500 THEN true
    WHEN p_amount > 250
      AND p_amount = trunc(p_amount)
      AND p_quantity = (trunc(p_amount)::integer * 3) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.ticket_pricing_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW."isFree" IS NOT DISTINCT FROM OLD."isFree"
  THEN
    -- Paid-mark / stripeSession updates without touching pricing — allow.
    RETURN NEW;
  END IF;

  IF NOT public.ticket_pricing_ok(NEW.amount, NEW.quantity, NEW."isFree") THEN
    -- Defense in depth: if paid is being set and amount is a valid paid tier,
    -- snap quantity to the canonical value instead of accepting underpaid entries.
    IF coalesce(NEW."isFree", false) THEN
      NEW.amount := 0;
      NEW.quantity := 1;
    ELSIF NEW.amount IN (5, 10, 20, 40, 100, 250)
       OR (NEW.amount > 250 AND NEW.amount = trunc(NEW.amount))
    THEN
      expected := CASE NEW.amount::integer
        WHEN 5 THEN 1
        WHEN 10 THEN 3
        WHEN 20 THEN 10
        WHEN 40 THEN 40
        WHEN 100 THEN 200
        WHEN 250 THEN 500
        ELSE (NEW.amount::integer * 3)
      END;
      NEW.quantity := expected;
    ELSE
      RAISE EXCEPTION
        'Invalid ticket amount/quantity pair (amount=%, quantity=%, isFree=%)',
        NEW.amount, NEW.quantity, NEW."isFree";
    END IF;

    IF NOT public.ticket_pricing_ok(NEW.amount, NEW.quantity, NEW."isFree") THEN
      RAISE EXCEPTION
        'Invalid ticket amount/quantity pair (amount=%, quantity=%, isFree=%)',
        NEW.amount, NEW.quantity, NEW."isFree";
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_pricing_guard ON public.ticket;
CREATE TRIGGER ticket_pricing_guard
  BEFORE INSERT OR UPDATE OF amount, quantity, "isFree"
  ON public.ticket
  FOR EACH ROW
  EXECUTE PROCEDURE public.ticket_pricing_guard();

GRANT EXECUTE ON FUNCTION public.ticket_pricing_ok(numeric, integer, boolean)
  TO anon, authenticated, service_role;
