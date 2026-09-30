-- =============================================================================
-- 019_ticket_checkout_and_manager_insert.sql
-- Fix Buy Tickets RLS for logged-in users (incl. super admin) + anon RETURNING.
-- Safe to re-run after 017.
-- =============================================================================

-- Open-raffle check without relying on anon column grants on donation_form
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

-- Buyers (logged out or logged in) may create unpaid tickets for open raffles
DROP POLICY IF EXISTS "Buyers can insert tickets" ON ticket;
DROP POLICY IF EXISTS "Public can insert tickets" ON ticket;
CREATE POLICY "Buyers can insert tickets"
  ON ticket FOR INSERT TO anon, authenticated
  WITH CHECK (
    "donation_formId" IS NOT NULL
    AND coalesce(paid, false) = false
    AND coalesce("isWinner", false) = false
    AND public.raffle_is_open_for_purchase("donation_formId")
  );

-- Managers (super admin / org owner / worker) may insert on managed raffles
DROP POLICY IF EXISTS "Managers can insert tickets on managed raffles" ON ticket;
CREATE POLICY "Managers can insert tickets on managed raffles"
  ON ticket FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_raffle("donation_formId"));

-- Anon may read non-PII columns for unpaid checkout (optional RETURNING)
DROP POLICY IF EXISTS "Anon can read unpaid checkout tickets" ON ticket;
CREATE POLICY "Anon can read unpaid checkout tickets"
  ON ticket FOR SELECT TO anon
  USING (
    paid = false
    AND created_at > (now() - interval '2 hours')
  );

GRANT SELECT (
  id,
  "donation_formId",
  paid,
  quantity,
  amount,
  created_at,
  updated_at,
  "isWinner",
  "isFree"
) ON TABLE ticket TO anon;

GRANT INSERT, UPDATE ON TABLE ticket TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ticket TO authenticated;
