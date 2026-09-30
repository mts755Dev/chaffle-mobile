-- =============================================================================
-- 020_fix_ticket_buyer_insert.sql
-- Nuclear fix for Buy Tickets: any anon/authenticated client may insert an
-- unpaid, non-winner ticket. Winner / unpaid→paid rules stay in triggers + UPDATE policies.
-- Run in SQL Editor. Safe to re-run.
-- =============================================================================

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

-- Drop every insert policy and recreate one clear buyer policy + manager policy
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

GRANT INSERT, UPDATE ON TABLE ticket TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ticket TO authenticated;
