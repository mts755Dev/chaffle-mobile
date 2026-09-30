-- =============================================================================
-- 015_mobile_rls_feature_checklist.sql
-- Hardens RLS so mobile features don't break one-by-one after enabling RLS.
-- Safe to re-run. Run in Supabase SQL Editor after 013/014.
--
-- Access matrix (mobile):
--   donation_form SELECT  → anon + authenticated (public catalogue)
--   donation_form write   → super_admin | org owner | worker (scoped)
--   ticket SELECT         → paid | recent unpaid (2h) | can_manage_raffle
--   ticket INSERT         → buyers (anon/auth) | workers on assigned raffle
--   ticket UPDATE paid    → unpaid + within 2h (checkout) | managers
--   organization SELECT   → owner | super_admin
--   worker / secure_link  → org owner | super_admin | own worker row
-- =============================================================================

-- Helpers (idempotent; matches app + edge auth)
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

  IF coalesce(jwt #>> '{user_metadata,role}', '') IN ('admin', 'super_admin')
     OR coalesce(jwt #>> '{app_metadata,role}', '') IN ('admin', 'super_admin') THEN
    RETURN true;
  END IF;

  role := coalesce(jwt #>> '{user_metadata,role}', jwt #>> '{app_metadata,role}');
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

GRANT EXECUTE ON FUNCTION public.is_super_admin_jwt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_organization(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_worker_for_raffle(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_raffle(uuid) TO anon, authenticated, service_role;

-- donation_form
ALTER TABLE donation_form ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read raffles" ON donation_form;
CREATE POLICY "Public can read raffles"
  ON donation_form FOR SELECT TO anon, authenticated
  USING (true);
GRANT SELECT ON TABLE donation_form TO anon, authenticated;

DROP POLICY IF EXISTS "Managers can insert raffles" ON donation_form;
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

DROP POLICY IF EXISTS "Managers can update raffles" ON donation_form;
CREATE POLICY "Managers can update raffles"
  ON donation_form FOR UPDATE TO authenticated
  USING (public.can_manage_raffle(id))
  WITH CHECK (
    public.is_super_admin_jwt()
    OR public.is_worker_for_raffle(id)
    OR (organization_id IS NOT NULL AND public.owns_organization(organization_id))
  );

DROP POLICY IF EXISTS "Managers can delete raffles" ON donation_form;
CREATE POLICY "Managers can delete raffles"
  ON donation_form FOR DELETE TO authenticated
  USING (
    public.is_super_admin_jwt()
    OR (organization_id IS NOT NULL AND public.owns_organization(organization_id))
  );

GRANT INSERT, UPDATE, DELETE ON TABLE donation_form TO authenticated;

-- ticket
ALTER TABLE ticket ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read tickets" ON ticket;
DROP POLICY IF EXISTS "Public can read paid tickets" ON ticket;
DROP POLICY IF EXISTS "Public can read paid and recent checkout tickets" ON ticket;
DROP POLICY IF EXISTS "Workers can read tickets for assigned raffle" ON ticket;
CREATE POLICY "Public can read paid and recent checkout tickets"
  ON ticket FOR SELECT TO anon, authenticated
  USING (
    paid = true
    OR created_at > (now() - interval '2 hours')
    OR public.can_manage_raffle("donation_formId")
  );

DROP POLICY IF EXISTS "Buyers can insert tickets" ON ticket;
DROP POLICY IF EXISTS "Public can insert tickets" ON ticket;
CREATE POLICY "Buyers can insert tickets"
  ON ticket FOR INSERT TO anon, authenticated
  WITH CHECK (
    "donation_formId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM donation_form d
      WHERE d.id = "donation_formId" AND d."winnerTicketId" IS NULL
    )
  );

DROP POLICY IF EXISTS "Workers can insert tickets for assigned raffle" ON ticket;
CREATE POLICY "Workers can insert tickets for assigned raffle"
  ON ticket FOR INSERT TO authenticated
  WITH CHECK (public.is_worker_for_raffle("donation_formId"));

DROP POLICY IF EXISTS "Buyers can update unpaid tickets in checkout window" ON ticket;
DROP POLICY IF EXISTS "Public can update tickets" ON ticket;
CREATE POLICY "Buyers can update unpaid tickets in checkout window"
  ON ticket FOR UPDATE TO anon, authenticated
  USING (
    paid = false
    AND created_at > (now() - interval '2 hours')
  )
  WITH CHECK ("donation_formId" IS NOT NULL);

DROP POLICY IF EXISTS "Managers can update tickets on managed raffles" ON ticket;
CREATE POLICY "Managers can update tickets on managed raffles"
  ON ticket FOR UPDATE TO authenticated
  USING (public.can_manage_raffle("donation_formId"))
  WITH CHECK (public.can_manage_raffle("donation_formId"));

DROP POLICY IF EXISTS "Managers can delete tickets on managed raffles" ON ticket;
CREATE POLICY "Managers can delete tickets on managed raffles"
  ON ticket FOR DELETE TO authenticated
  USING (public.can_manage_raffle("donation_formId"));

GRANT SELECT, INSERT, UPDATE ON TABLE ticket TO anon, authenticated;
GRANT DELETE ON TABLE ticket TO authenticated;

-- organization
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own organization" ON organization;
CREATE POLICY "Users can read their own organization"
  ON organization FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin_jwt());
DROP POLICY IF EXISTS "Super admins can read all organizations" ON organization;
CREATE POLICY "Super admins can read all organizations"
  ON organization FOR SELECT TO authenticated
  USING (public.is_super_admin_jwt());
GRANT SELECT ON TABLE organization TO authenticated;

-- secure_link (Stripe connect / admin regenerate)
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

-- worker
ALTER TABLE worker ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org admins can read own org workers" ON worker;
CREATE POLICY "Org admins can read own org workers"
  ON worker FOR SELECT TO authenticated
  USING (
    public.is_super_admin_jwt()
    OR (organization_id IS NOT NULL AND public.owns_organization(organization_id))
    OR user_id = auth.uid()
  );
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
GRANT SELECT, INSERT, DELETE ON TABLE worker TO authenticated;
