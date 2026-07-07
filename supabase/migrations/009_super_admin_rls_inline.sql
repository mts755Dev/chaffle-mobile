-- PostgREST returns "permission denied for schema auth" when RLS policies call
-- SQL functions that use auth.jwt(). Use inline JWT checks instead.

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

REVOKE ALL ON FUNCTION public.is_super_admin_jwt() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin_jwt() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin_jwt() TO service_role;

DROP POLICY IF EXISTS "Super admins can read all organizations" ON organization;
CREATE POLICY "Super admins can read all organizations"
  ON organization FOR SELECT
  USING (
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('admin', 'super_admin')
    OR (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'firstName', '') <> ''
      AND coalesce(
        auth.jwt() -> 'user_metadata' ->> 'organization_id',
        auth.jwt() -> 'app_metadata' ->> 'organization_id',
        ''
      ) = ''
      AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('org_admin', 'worker')
    )
  );

DROP POLICY IF EXISTS "Super admins can update organizations" ON organization;
CREATE POLICY "Super admins can update organizations"
  ON organization FOR UPDATE
  USING (
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('admin', 'super_admin')
    OR (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'firstName', '') <> ''
      AND coalesce(
        auth.jwt() -> 'user_metadata' ->> 'organization_id',
        auth.jwt() -> 'app_metadata' ->> 'organization_id',
        ''
      ) = ''
      AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('org_admin', 'worker')
    )
  );

DROP POLICY IF EXISTS "Super admins can delete organizations" ON organization;
CREATE POLICY "Super admins can delete organizations"
  ON organization FOR DELETE
  USING (
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('admin', 'super_admin')
    OR (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'firstName', '') <> ''
      AND coalesce(
        auth.jwt() -> 'user_metadata' ->> 'organization_id',
        auth.jwt() -> 'app_metadata' ->> 'organization_id',
        ''
      ) = ''
      AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('org_admin', 'worker')
    )
  );

DROP POLICY IF EXISTS "Super admins can read all workers" ON worker;
CREATE POLICY "Super admins can read all workers"
  ON worker FOR SELECT
  USING (
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('admin', 'super_admin')
    OR (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'firstName', '') <> ''
      AND coalesce(
        auth.jwt() -> 'user_metadata' ->> 'organization_id',
        auth.jwt() -> 'app_metadata' ->> 'organization_id',
        ''
      ) = ''
      AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('org_admin', 'worker')
    )
  );

DROP POLICY IF EXISTS "Super admins can insert workers" ON worker;
CREATE POLICY "Super admins can insert workers"
  ON worker FOR INSERT
  WITH CHECK (
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('admin', 'super_admin')
    OR (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'firstName', '') <> ''
      AND coalesce(
        auth.jwt() -> 'user_metadata' ->> 'organization_id',
        auth.jwt() -> 'app_metadata' ->> 'organization_id',
        ''
      ) = ''
      AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('org_admin', 'worker')
    )
  );

DROP POLICY IF EXISTS "Super admins can delete workers" ON worker;
CREATE POLICY "Super admins can delete workers"
  ON worker FOR DELETE
  USING (
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role'
    ) IN ('admin', 'super_admin')
    OR (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'firstName', '') <> ''
      AND coalesce(
        auth.jwt() -> 'user_metadata' ->> 'organization_id',
        auth.jwt() -> 'app_metadata' ->> 'organization_id',
        ''
      ) = ''
      AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('org_admin', 'worker')
    )
  );
