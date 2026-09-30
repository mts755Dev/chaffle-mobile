-- =============================================================================
-- 016_lock_org_approval_and_super_admin_claims.sql
-- SECURITY: Client report — orgs self-approving + users self-promoting to
-- super admin via user_metadata.role (writable by any signed-in user).
--
-- Fixes:
--  1) Only service_role may change approval_status / approved_* / terminated_*
--  2) is_super_admin_jwt() trusts ONLY app_metadata.role (not user_metadata)
--  3) Migrate existing admin claims into app_metadata; strip admin from user_metadata
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- After this, users must refresh session (sign out/in) to pick up app_metadata.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Block self-approve / self-terminate via PostgREST
--    Official approve path: manage-organizations edge (service_role) — still works.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organization_approval_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Signup / client INSERT must always land as pending (cannot self-approve on create)
  IF TG_OP = 'INSERT' THEN
    IF coalesce(auth.role(), '') <> 'service_role' THEN
      NEW.approval_status := 'pending';
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
      NEW.terminated_at := NULL;
      NEW.terminated_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.terminated_at IS DISTINCT FROM OLD.terminated_at
      OR NEW.terminated_by IS DISTINCT FROM OLD.terminated_by
    THEN
      IF coalesce(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION
          'Only platform service (super-admin approve/terminate flow) may change organization approval status';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_approval_guard ON organization;
CREATE TRIGGER organization_approval_guard
  BEFORE INSERT OR UPDATE ON organization
  FOR EACH ROW
  EXECUTE PROCEDURE public.organization_approval_guard();

-- ---------------------------------------------------------------------------
-- 2) Super-admin JWT helper — app_metadata ONLY (clients cannot write this)
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
BEGIN
  jwt := auth.jwt();
  IF jwt IS NULL THEN
    RETURN false;
  END IF;

  -- Never trust user_metadata.role — any user can set it via auth.updateUser
  role := jwt #>> '{app_metadata,role}';
  RETURN role IN ('admin', 'super_admin');
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin_jwt() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Migrate existing platform admins: copy admin claim → app_metadata
--    then remove forgeable admin/super_admin from user_metadata
-- ---------------------------------------------------------------------------

UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role',
    CASE
      WHEN COALESCE(raw_app_meta_data->>'role', '') IN ('admin', 'super_admin')
        THEN raw_app_meta_data->>'role'
      WHEN COALESCE(raw_user_meta_data->>'role', '') IN ('admin', 'super_admin')
        THEN 'admin'
      ELSE COALESCE(raw_app_meta_data->>'role', '')
    END
  )
WHERE
  COALESCE(raw_user_meta_data->>'role', '') IN ('admin', 'super_admin')
  OR COALESCE(raw_app_meta_data->>'role', '') IN ('admin', 'super_admin');

-- Strip forgeable platform-admin marks from user_metadata
UPDATE auth.users
SET raw_user_meta_data =
  CASE
    WHEN COALESCE(raw_user_meta_data->>'role', '') IN ('admin', 'super_admin')
      THEN (COALESCE(raw_user_meta_data, '{}'::jsonb) - 'role')
    ELSE COALESCE(raw_user_meta_data, '{}'::jsonb)
  END
WHERE COALESCE(raw_user_meta_data->>'role', '') IN ('admin', 'super_admin');

-- Ensure org_admin stays in user_metadata for existing org accounts (unchanged)
-- Platform admins now rely on app_metadata.role only.

-- ---------------------------------------------------------------------------
-- 4) Incident audit (read-only) — run separately after apply if needed:
--
-- -- Orgs that look self-approved (approved_by = owner, or approved with no approver)
-- SELECT id, name, approval_status, owner_id, approved_by, approved_at, created_at
-- FROM organization
-- WHERE approval_status = 'approved'
--   AND (approved_by IS NULL OR approved_by = owner_id)
-- ORDER BY approved_at DESC NULLS LAST;
--
-- -- Users currently holding platform admin in app_metadata
-- SELECT id, email, raw_app_meta_data->>'role' AS app_role,
--        raw_user_meta_data->>'role' AS user_role, created_at
-- FROM auth.users
-- WHERE raw_app_meta_data->>'role' IN ('admin', 'super_admin')
-- ORDER BY created_at;
-- ---------------------------------------------------------------------------
