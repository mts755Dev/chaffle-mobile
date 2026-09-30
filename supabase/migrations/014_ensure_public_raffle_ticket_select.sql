-- =============================================================================
-- 014_ensure_public_raffle_ticket_select.sql
-- ROOT FIX (not a client hotfix): authenticated JWT was getting 0 raffles
-- while anon still saw rows. Public SELECT must include BOTH roles.
--
-- Run once in Supabase → SQL Editor → Run. Safe to re-run.
-- After this, mobile should use the normal authenticated Supabase client.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (needed for manager ticket reads). Idempotent.
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
  -- Either metadata bucket may mark super admin (stale app_metadata must not win alone)
  IF coalesce(jwt #>> '{app_metadata,role}', '') IN ('admin', 'super_admin') THEN
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

-- ---------------------------------------------------------------------------
-- donation_form — public read for anon AND authenticated (admin dashboards)
-- ---------------------------------------------------------------------------

ALTER TABLE donation_form ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read raffles" ON donation_form;
DROP POLICY IF EXISTS "Org admins can read own raffles" ON donation_form;
DROP POLICY IF EXISTS "Workers can read assigned raffle" ON donation_form;

CREATE POLICY "Public can read raffles"
  ON donation_form FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE donation_form TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- ticket — paid + recent checkout + managers (super/org/worker)
-- ---------------------------------------------------------------------------

ALTER TABLE ticket ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read tickets" ON ticket;
DROP POLICY IF EXISTS "Public can read paid and recent checkout tickets" ON ticket;
DROP POLICY IF EXISTS "Public can read paid tickets" ON ticket;
DROP POLICY IF EXISTS "Workers can read tickets for assigned raffle" ON ticket;

CREATE POLICY "Public can read paid and recent checkout tickets"
  ON ticket FOR SELECT
  TO anon, authenticated
  USING (
    paid = true
    OR created_at > (now() - interval '2 hours')
    OR public.can_manage_raffle("donation_formId")
  );

GRANT SELECT ON TABLE ticket TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- organization — super admin can read all (dashboard org labels)
-- ---------------------------------------------------------------------------

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
