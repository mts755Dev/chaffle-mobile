-- Store worker login password for admin/org reference (auth hashes cannot be retrieved).

ALTER TABLE worker
  ADD COLUMN IF NOT EXISTS login_password TEXT;

CREATE OR REPLACE FUNCTION public.create_worker_profile(
  p_email TEXT,
  p_raffle_id UUID,
  p_organization_id UUID,
  p_created_by UUID,
  p_user_id UUID,
  p_expires_at TIMESTAMPTZ,
  p_login_password TEXT DEFAULT NULL
)
RETURNS public.worker
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.worker;
BEGIN
  INSERT INTO public.worker (
    email,
    raffle_id,
    organization_id,
    created_by,
    user_id,
    expires_at,
    login_password
  )
  VALUES (
    p_email,
    p_raffle_id,
    p_organization_id,
    p_created_by,
    p_user_id,
    p_expires_at,
    p_login_password
  )
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_worker_profile(
  TEXT, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_worker_profile(
  TEXT, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT
) TO service_role;

-- Keep login_password readable only via service role (manage-workers edge function).
REVOKE SELECT (login_password) ON worker FROM authenticated;
