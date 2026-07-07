-- Allow legacy super admins (firstName, no organization_id) to manage organizations.
-- Mobile/web super admin detection matches chaffle/lib/authRoles.ts.

CREATE OR REPLACE FUNCTION public.is_super_admin_jwt()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('admin', 'super_admin')
    OR (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'firstName', '') <> ''
      AND coalesce(auth.jwt() -> 'user_metadata' ->> 'organization_id', '') = ''
      AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('org_admin', 'worker')
    );
$$;

DROP POLICY IF EXISTS "Super admins can read all organizations" ON organization;
CREATE POLICY "Super admins can read all organizations"
  ON organization FOR SELECT
  USING (public.is_super_admin_jwt());

DROP POLICY IF EXISTS "Super admins can update organizations" ON organization;
CREATE POLICY "Super admins can update organizations"
  ON organization FOR UPDATE
  USING (public.is_super_admin_jwt());
