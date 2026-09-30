-- =============================================================================
-- 018_security_verify_and_incident_audit.sql
-- READ-ONLY checks + optional incident cleanup helpers (commented).
-- Run AFTER 016 + 017 in Supabase SQL Editor.
-- =============================================================================

-- 1) 016 applied? approval guard trigger present
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'organization_approval_guard';

-- 2) is_super_admin_jwt trusts app_metadata only (should NOT mention user_metadata.role)
SELECT pg_get_functiondef('public.is_super_admin_jwt()'::regprocedure) AS def;

-- 3) 017 applied? public totals RPCs exist
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'raffle_public_totals',
    'raffle_public_totals_for_ids',
    'raffle_public_stripe_account_id'
  )
ORDER BY proname;

-- 4) anon must NOT have full SELECT on ticket (PII lock)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'ticket'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- 5) Platform admins currently in app_metadata (review this list)
SELECT id, email,
       raw_app_meta_data->>'role' AS app_role,
       raw_user_meta_data->>'role' AS user_role,
       created_at
FROM auth.users
WHERE raw_app_meta_data->>'role' IN ('admin', 'super_admin')
   OR raw_user_meta_data->>'role' IN ('admin', 'super_admin')
ORDER BY created_at;

-- 6) Orgs that look self-approved (review / reset)
SELECT id, name, approval_status, owner_id, approved_by, approved_at, created_at
FROM organization
WHERE approval_status = 'approved'
  AND (approved_by IS NULL OR approved_by = owner_id)
ORDER BY approved_at DESC NULLS LAST;

-- =============================================================================
-- OPTIONAL CLEANUP (uncomment only after reviewing #5 and #6)
-- =============================================================================

-- -- Demote a forged platform admin (replace USER_UUID):
-- -- UPDATE auth.users
-- -- SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) - 'role',
-- --     raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) - 'role'
-- -- WHERE id = 'USER_UUID';

-- -- Reset suspicious self-approved org to pending (replace ORG_UUID):
-- -- UPDATE organization
-- -- SET approval_status = 'pending',
-- --     approved_at = NULL,
-- --     approved_by = NULL
-- -- WHERE id = 'ORG_UUID';
