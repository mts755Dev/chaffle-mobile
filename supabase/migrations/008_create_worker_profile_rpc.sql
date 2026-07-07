-- Edge function helper: insert worker rows with elevated privileges.

CREATE OR REPLACE FUNCTION public.create_worker_profile(
  p_email TEXT,
  p_raffle_id UUID,
  p_organization_id UUID,
  p_created_by UUID,
  p_user_id UUID,
  p_expires_at TIMESTAMPTZ
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
    expires_at
  )
  VALUES (
    p_email,
    p_raffle_id,
    p_organization_id,
    p_created_by,
    p_user_id,
    p_expires_at
  )
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_worker_profile(
  TEXT, UUID, UUID, UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_worker_profile(
  TEXT, UUID, UUID, UUID, UUID, TIMESTAMPTZ
) TO service_role;
