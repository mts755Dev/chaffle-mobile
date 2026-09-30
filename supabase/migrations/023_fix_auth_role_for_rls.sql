-- =============================================================================
-- 023_fix_auth_role_for_rls.sql
-- ROOT CAUSE: Some super-admin Auth users have auth.users.role = 'admin'.
-- PostgREST puts that into the JWT `role` claim. RLS policies are granted to
-- `anon` / `authenticated` only — JWT role `admin` matches NONE → every
-- ticket INSERT fails with "new row violates row-level security policy".
--
-- Platform privilege must live in raw_app_meta_data.role ONLY.
-- auth.users.role must stay 'authenticated' for all app users.
--
-- Safe to re-run. After running, affected users must sign out/in (or refresh
-- session) so the JWT picks up role=authenticated.
-- =============================================================================

-- auth.users.role is the GoTrue / JWT role claim (Postgres role for RLS),
-- NOT the Chaffle app role (that is raw_app_meta_data->>'role').
UPDATE auth.users
SET role = 'authenticated'
WHERE role IS DISTINCT FROM 'authenticated'
  AND role IS DISTINCT FROM 'anon'
  AND id IS NOT NULL;

-- Ensure platform admins still have app_metadata.role (privilege source of truth)
UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin')
WHERE
  COALESCE(raw_app_meta_data->>'role', '') NOT IN ('admin', 'super_admin')
  AND (
    email IN ('admin@chaffle.org')
    OR COALESCE(raw_user_meta_data->>'role', '') IN ('admin', 'super_admin')
  );

-- Verify (optional): should return 0 rows after fix
-- SELECT id, email, role, raw_app_meta_data->>'role' AS app_role
-- FROM auth.users
-- WHERE role IS DISTINCT FROM 'authenticated' AND role IS DISTINCT FROM 'anon';
