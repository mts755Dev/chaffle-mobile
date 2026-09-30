-- =============================================================================
-- 022_ticket_checkout_rls_no_bypass.sql
-- Keep RLS ON. Checkout uses anon/authenticated INSERT policies only.
-- Removes the 021 SECURITY DEFINER insert RPC if it was applied.
-- Safe to re-run.
-- =============================================================================

-- 1) Remove privileged insert RPC (021) — we do not want insert bypass
DROP FUNCTION IF EXISTS public.create_checkout_ticket(
  uuid, text, text, numeric, integer, text, text, text, boolean
);

-- 2) Open-raffle CHECK helper (read-only). SECURITY DEFINER only so RLS on
--    donation_form cannot hide winnerTicketId from the policy check.
--    This does NOT insert or update any row.
CREATE OR REPLACE FUNCTION public.raffle_is_open_for_purchase(p_raffle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM donation_form d
    WHERE d.id = p_raffle_id
      AND d."winnerTicketId" IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.raffle_is_open_for_purchase(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raffle_is_open_for_purchase(uuid)
  TO anon, authenticated, service_role;

-- 3) Rebuild INSERT policies — buyers only unpaid / non-winner / open raffle
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ticket'
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ticket', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Buyers can insert unpaid tickets"
  ON ticket FOR INSERT TO anon, authenticated
  WITH CHECK (
    "donation_formId" IS NOT NULL
    AND coalesce(paid, false) = false
    AND coalesce("isWinner", false) = false
    AND public.raffle_is_open_for_purchase("donation_formId")
  );

CREATE POLICY "Managers can insert tickets on managed raffles"
  ON ticket FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_raffle("donation_formId"));

-- 4) Anon: INSERT/UPDATE for checkout only — still no broad SELECT (scrape lock)
GRANT INSERT, UPDATE ON TABLE ticket TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ticket TO authenticated;
GRANT ALL ON TABLE ticket TO service_role;
