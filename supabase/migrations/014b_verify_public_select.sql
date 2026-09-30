-- =============================================================================
-- VERIFY after running 014 — paste in SQL Editor. Expect raffles > 0 and a
-- "Public can read raffles" policy that includes authenticated.
-- =============================================================================

SELECT count(*) AS raffle_count FROM donation_form;

SELECT
  c.relname AS table_name,
  pol.polname AS policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    ELSE pol.polcmd::text
  END AS command,
  pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('donation_form', 'ticket', 'organization')
ORDER BY 1, 2;
