-- =============================================================================
-- 013_unified_rls_web_mobile.sql
-- Single RLS source of truth for website + mobile (same Supabase project).
--
-- Access planes:
--   • Website Prisma / edge functions with service_role → bypass RLS (unchanged)
--   • Mobile + public PostgREST (anon / authenticated JWT) → these policies
--
-- Roles (JWT user_metadata / app_metadata.role):
--   super_admin: 'admin' | 'super_admin' (+ legacy firstName heuristic)
--   org_admin:   'org_admin'  (scope via organization.owner_id = auth.uid())
--   worker:      'worker'     (scope via worker.user_id + raffle_id + expires_at)
--   anon:        public buyers / raffle viewers
--
-- Safe to re-run (DROP POLICY IF EXISTS / CREATE OR REPLACE).
-- Apply in Supabase SQL Editor or: supabase db push
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Helpers (SECURITY DEFINER — avoid "permission denied for schema auth")
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin_jwt()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt jsonb;
  role text;
  first_name text;
  organization_id text;
BEGIN
  jwt := auth.jwt();
  IF jwt IS NULL THEN
    RETURN false;
  END IF;

  role := coalesce(jwt #>> '{user_metadata,role}', jwt #>> '{app_metadata,role}');
  IF role IN ('admin', 'super_admin') THEN
    RETURN true;
  END IF;
  IF role IN ('org_admin', 'worker') THEN
    RETURN false;
  END IF;

  first_name := coalesce(jwt #>> '{user_metadata,firstName}', '');
  organization_id := coalesce(
    jwt #>> '{user_metadata,organization_id}',
    jwt #>> '{app_metadata,organization_id}',
    ''
  );

  RETURN first_name <> '' AND organization_id = '';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_jwt()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    auth.jwt() #>> '{user_metadata,role}',
    auth.jwt() #>> '{app_metadata,role}'
  ) = 'org_admin';
$$;

CREATE OR REPLACE FUNCTION public.owns_organization(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization o
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
    SELECT 1 FROM worker w
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
      SELECT 1 FROM donation_form d
      WHERE d.id = raffle
        AND d.organization_id IS NOT NULL
        AND public.owns_organization(d.organization_id)
    );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin_jwt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin_jwt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_worker_for_raffle(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_raffle(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_super_admin_jwt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin_jwt() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_organization(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_worker_for_raffle(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_raffle(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) organization — already has RLS; normalize super-admin via helper
-- ---------------------------------------------------------------------------

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own organization" ON organization;
CREATE POLICY "Users can read their own organization"
  ON organization FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin_jwt());

DROP POLICY IF EXISTS "Users can insert their own organization" ON organization;
CREATE POLICY "Users can insert their own organization"
  ON organization FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Org owners can update own organization" ON organization;
DROP POLICY IF EXISTS "Users can update their own organization" ON organization;
CREATE POLICY "Org owners can update own organization"
  ON organization FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin_jwt())
  WITH CHECK (owner_id = auth.uid() OR public.is_super_admin_jwt());

DROP POLICY IF EXISTS "Super admins can read all organizations" ON organization;
CREATE POLICY "Super admins can read all organizations"
  ON organization FOR SELECT TO authenticated
  USING (public.is_super_admin_jwt());

DROP POLICY IF EXISTS "Super admins can update organizations" ON organization;
CREATE POLICY "Super admins can update organizations"
  ON organization FOR UPDATE TO authenticated
  USING (public.is_super_admin_jwt())
  WITH CHECK (public.is_super_admin_jwt());

DROP POLICY IF EXISTS "Super admins can delete organizations" ON organization;
CREATE POLICY "Super admins can delete organizations"
  ON organization FOR DELETE TO authenticated
  USING (public.is_super_admin_jwt());

-- ---------------------------------------------------------------------------
-- 2) donation_form (raffles) — ENABLE RLS + public read + scoped writes
-- ---------------------------------------------------------------------------

ALTER TABLE donation_form ENABLE ROW LEVEL SECURITY;

-- Public raffle pages (web + mobile) must read all raffles
DROP POLICY IF EXISTS "Public can read raffles" ON donation_form;
DROP POLICY IF EXISTS "Org admins can read own raffles" ON donation_form;
DROP POLICY IF EXISTS "Workers can read assigned raffle" ON donation_form;
CREATE POLICY "Public can read raffles"
  ON donation_form FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Org admins can insert raffles" ON donation_form;
CREATE POLICY "Managers can insert raffles"
  ON donation_form FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin_jwt()
    OR (
      organization_id IS NOT NULL
      AND public.owns_organization(organization_id)
      AND EXISTS (
        SELECT 1 FROM organization o
        WHERE o.id = organization_id AND o.approval_status = 'approved'
      )
    )
  );

DROP POLICY IF EXISTS "Org admins can update own raffles" ON donation_form;
CREATE POLICY "Managers can update raffles"
  ON donation_form FOR UPDATE TO authenticated
  USING (public.can_manage_raffle(id))
  WITH CHECK (
    public.is_super_admin_jwt()
    OR public.is_worker_for_raffle(id)
    OR (
      organization_id IS NOT NULL
      AND public.owns_organization(organization_id)
    )
  );

DROP POLICY IF EXISTS "Managers can delete raffles" ON donation_form;
CREATE POLICY "Managers can delete raffles"
  ON donation_form FOR DELETE TO authenticated
  USING (
    public.is_super_admin_jwt()
    OR (
      organization_id IS NOT NULL
      AND public.owns_organization(organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3) ticket — harden public purchase without breaking mobile checkout
-- ---------------------------------------------------------------------------

ALTER TABLE ticket ENABLE ROW LEVEL SECURITY;

-- Drop legacy open policies
DROP POLICY IF EXISTS "Public can insert tickets" ON ticket;
DROP POLICY IF EXISTS "Public can read tickets" ON ticket;
DROP POLICY IF EXISTS "Public can update tickets" ON ticket;
DROP POLICY IF EXISTS "Workers can read tickets for assigned raffle" ON ticket;
DROP POLICY IF EXISTS "Workers can insert tickets for assigned raffle" ON ticket;

-- INSERT: buyers + workers (raffle must exist; prefer no winner yet)
CREATE POLICY "Buyers can insert tickets"
  ON ticket FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    "donation_formId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM donation_form d
      WHERE d.id = "donation_formId"
        AND d."winnerTicketId" IS NULL
    )
  );

CREATE POLICY "Workers can insert tickets for assigned raffle"
  ON ticket FOR INSERT TO authenticated
  WITH CHECK (public.is_worker_for_raffle("donation_formId"));

-- SELECT:
--   • paid rows → pot / stats / realtime (public)
--   • recent unpaid → INSERT RETURNING + checkout confirm window (2h)
--   • managers → full PII for their raffles
CREATE POLICY "Public can read paid and recent checkout tickets"
  ON ticket FOR SELECT
  TO anon, authenticated
  USING (
    paid = true
    OR created_at > (now() - interval '2 hours')
    OR public.can_manage_raffle("donation_formId")
  );

-- UPDATE: only unpaid tickets in checkout window (confirmPaymentSuccess)
-- Winner / un-pay blocked by trigger below for anon|authenticated
CREATE POLICY "Buyers can update unpaid tickets in checkout window"
  ON ticket FOR UPDATE
  TO anon, authenticated
  USING (
    paid = false
    AND created_at > (now() - interval '2 hours')
  )
  WITH CHECK (
    "donation_formId" IS NOT NULL
  );

CREATE POLICY "Managers can update tickets on managed raffles"
  ON ticket FOR UPDATE TO authenticated
  USING (public.can_manage_raffle("donation_formId"))
  WITH CHECK (public.can_manage_raffle("donation_formId"));

CREATE POLICY "Managers can delete tickets on managed raffles"
  ON ticket FOR DELETE TO authenticated
  USING (public.can_manage_raffle("donation_formId"));

GRANT SELECT, INSERT, UPDATE ON TABLE ticket TO anon, authenticated;
GRANT DELETE ON TABLE ticket TO authenticated;

-- Guard: clients cannot set winner or un-pay; service_role / raffle-draw OK
CREATE OR REPLACE FUNCTION public.ticket_client_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / postgres (Prisma, edges) bypass
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."isWinner" IS TRUE AND coalesce(OLD."isWinner", false) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Clients cannot mark a ticket as winner';
    END IF;
    IF OLD.paid IS TRUE AND NEW.paid IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Clients cannot un-pay a ticket';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW."isWinner" IS TRUE THEN
    RAISE EXCEPTION 'Clients cannot insert a winning ticket';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_client_write_guard ON ticket;
CREATE TRIGGER ticket_client_write_guard
  BEFORE INSERT OR UPDATE ON ticket
  FOR EACH ROW
  EXECUTE PROCEDURE public.ticket_client_write_guard();

-- ---------------------------------------------------------------------------
-- 4) worker — keep existing shape; ensure super-admin helper
-- ---------------------------------------------------------------------------

ALTER TABLE worker ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins can read own org workers" ON worker;
CREATE POLICY "Org admins can read own org workers"
  ON worker FOR SELECT TO authenticated
  USING (
    public.is_super_admin_jwt()
    OR (organization_id IS NOT NULL AND public.owns_organization(organization_id))
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Workers can read own record" ON worker;
-- covered above via user_id = auth.uid()

DROP POLICY IF EXISTS "Org admins can insert workers for own org" ON worker;
CREATE POLICY "Org admins can insert workers for own org"
  ON worker FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin_jwt()
    OR (organization_id IS NOT NULL AND public.owns_organization(organization_id))
  );

DROP POLICY IF EXISTS "Org admins can delete own org workers" ON worker;
CREATE POLICY "Org admins can delete own org workers"
  ON worker FOR DELETE TO authenticated
  USING (
    public.is_super_admin_jwt()
    OR (organization_id IS NOT NULL AND public.owns_organization(organization_id))
  );

DROP POLICY IF EXISTS "Super admins can read all workers" ON worker;
DROP POLICY IF EXISTS "Super admins can insert workers" ON worker;
DROP POLICY IF EXISTS "Super admins can delete workers" ON worker;
-- super-admin covered in policies above via is_super_admin_jwt()

-- ---------------------------------------------------------------------------
-- 5) secure_link — ENABLE RLS (mobile regenerateSecureLink)
-- ---------------------------------------------------------------------------

ALTER TABLE secure_link ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can read secure links" ON secure_link;
CREATE POLICY "Managers can read secure links"
  ON secure_link FOR SELECT TO authenticated
  USING (public.can_manage_raffle("raffleId"));

DROP POLICY IF EXISTS "Managers can insert secure links" ON secure_link;
CREATE POLICY "Managers can insert secure links"
  ON secure_link FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_raffle("raffleId"));

DROP POLICY IF EXISTS "Managers can update secure links" ON secure_link;
CREATE POLICY "Managers can update secure links"
  ON secure_link FOR UPDATE TO authenticated
  USING (public.can_manage_raffle("raffleId"))
  WITH CHECK (public.can_manage_raffle("raffleId"));

DROP POLICY IF EXISTS "Managers can delete secure links" ON secure_link;
CREATE POLICY "Managers can delete secure links"
  ON secure_link FOR DELETE TO authenticated
  USING (public.can_manage_raffle("raffleId"));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE secure_link TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) draw_audit — ENABLE RLS (writes only via service_role / raffle-draw)
-- ---------------------------------------------------------------------------

ALTER TABLE draw_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can read draw audits" ON draw_audit;
CREATE POLICY "Managers can read draw audits"
  ON draw_audit FOR SELECT TO authenticated
  USING (public.can_manage_raffle("raffleId"));

-- Public verify page uses Prisma (bypass). No anon INSERT/UPDATE/DELETE.
-- service_role bypasses RLS for raffle-draw inserts.

GRANT SELECT ON TABLE draw_audit TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Realtime publication (idempotent)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ticket'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket;
  END IF;
END $$;

-- =============================================================================
-- Notes for ops:
-- 1. Website Prisma continues to bypass RLS — no change.
-- 2. Mobile checkout still uses client UPDATE to set paid=true within 2h.
--    Longer-term: move confirmPaymentSuccess into an edge function + Stripe verify.
-- 3. Storage bucket policies are configured in Dashboard (not this file).
-- 4. Prefer deploying raffle-draw / payment edges with service_role for writes.
-- =============================================================================
