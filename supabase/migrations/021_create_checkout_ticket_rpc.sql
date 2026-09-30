-- =============================================================================
-- 021_create_checkout_ticket_rpc.sql  (DEPRECATED — do not use)
-- Prefer 022_ticket_checkout_rls_no_bypass.sql which DROPS this RPC and keeps
-- checkout under normal ticket INSERT RLS (anon/authenticated buyer policies).
-- Safe to re-run: only removes the privileged function if present.
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_checkout_ticket(
  uuid, text, text, numeric, integer, text, text, text, boolean
);
