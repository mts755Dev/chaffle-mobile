-- =============================================================================
-- 017_lock_public_scrape_surface.sql
-- SECURITY: Stop anon PostgREST scrapers from dumping buyer PII and Stripe JSON.
--
-- - anon: no SELECT on ticket rows (use raffle_public_totals RPC for live pot)
-- - anon: donation_form SELECT limited to display columns (no stripeAccount)
-- - authenticated: full SELECT kept for managers/workers via existing RLS
--
-- Run in Supabase SQL Editor after 016. Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Safe aggregate RPC — live pot without listing tickets / PII
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.raffle_public_totals(p_raffle_id uuid)
RETURNS TABLE (
  ticket_count bigint,
  entry_sum bigint,
  amount_sum bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    coalesce(sum(t.quantity), 0)::bigint,
    coalesce(sum(t.amount), 0)::bigint
  FROM ticket t
  WHERE t.paid = true
    AND t."donation_formId" = p_raffle_id;
$$;

CREATE OR REPLACE FUNCTION public.raffle_public_totals_for_ids(p_raffle_ids uuid[])
RETURNS TABLE (
  donation_form_id uuid,
  ticket_count bigint,
  entry_sum bigint,
  amount_sum bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t."donation_formId",
    count(*)::bigint,
    coalesce(sum(t.quantity), 0)::bigint,
    coalesce(sum(t.amount), 0)::bigint
  FROM ticket t
  WHERE t.paid = true
    AND t."donation_formId" = ANY (p_raffle_ids)
  GROUP BY t."donation_formId";
$$;

-- Stripe Connect account id only (needed for client PaymentIntent) — not full JSON
CREATE OR REPLACE FUNCTION public.raffle_public_stripe_account_id(p_raffle_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(d."stripeAccount"->>'id', ''),
    nullif(o.stripe_account_id, '')
  )
  FROM donation_form d
  LEFT JOIN organization o ON o.id = d.organization_id
  WHERE d.id = p_raffle_id;
$$;

REVOKE ALL ON FUNCTION public.raffle_public_totals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raffle_public_totals_for_ids(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raffle_public_stripe_account_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raffle_public_totals(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.raffle_public_totals_for_ids(uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.raffle_public_stripe_account_id(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Ticket RLS — split anon vs authenticated
--    anon: no row SELECT (blocks PostgREST dump + realtime PII payloads)
--    authenticated: paid OR recent checkout OR can_manage (unchanged capability)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can read tickets" ON ticket;
DROP POLICY IF EXISTS "Public can read paid tickets" ON ticket;
DROP POLICY IF EXISTS "Public can read paid and recent checkout tickets" ON ticket;
DROP POLICY IF EXISTS "Anon can read paid ticket aggregates columns" ON ticket;
DROP POLICY IF EXISTS "Authenticated can read paid recent or managed tickets" ON ticket;

CREATE POLICY "Authenticated can read paid recent or managed tickets"
  ON ticket FOR SELECT TO authenticated
  USING (
    paid = true
    OR created_at > (now() - interval '2 hours')
    OR public.can_manage_raffle("donation_formId")
  );

-- Defense in depth: even if a future policy re-opens anon rows, deny PII columns.
REVOKE ALL ON TABLE ticket FROM anon;
-- Anon still needs INSERT/UPDATE for buyer checkout window (existing policies).
GRANT INSERT, UPDATE ON TABLE ticket TO anon;
-- No SELECT grant to anon on ticket.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ticket TO authenticated;
GRANT ALL ON TABLE ticket TO service_role;

-- ---------------------------------------------------------------------------
-- 3) donation_form — anon may read display fields only (no stripeAccount JSON)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE donation_form FROM anon;

-- Display / catalogue columns only (matches PublicDonationForm + mobile preview needs)
GRANT SELECT (
  id,
  title,
  mission_statement,
  charity_info,
  donation_amount_information,
  rules,
  "backgroundImage",
  images,
  created_at,
  updated_at,
  draw_date,
  min_ticket_price,
  "raffleLocation",
  "autoCheckDonation",
  "locationCheckEnabled",
  "winnerTicketId",
  "drawCompletedAt",
  custom_domain,
  presented_by_name,
  presented_by_image,
  mobile_title,
  organization_id
) ON TABLE donation_form TO anon;

-- Authenticated managers still need full row (incl. stripeAccount) for admin UI
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE donation_form TO authenticated;
GRANT ALL ON TABLE donation_form TO service_role;

-- Keep public catalogue RLS (anon + authenticated); column GRANT limits what anon sees
DROP POLICY IF EXISTS "Public can read raffles" ON donation_form;
CREATE POLICY "Public can read raffles"
  ON donation_form FOR SELECT TO anon, authenticated
  USING (true);
