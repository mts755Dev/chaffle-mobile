-- Super admin worker management + org-less platform raffles

ALTER TABLE worker
  ALTER COLUMN organization_id DROP NOT NULL;

DROP POLICY IF EXISTS "Super admins can read all workers" ON worker;
CREATE POLICY "Super admins can read all workers"
  ON worker FOR SELECT
  USING (public.is_super_admin_jwt());

DROP POLICY IF EXISTS "Super admins can insert workers" ON worker;
CREATE POLICY "Super admins can insert workers"
  ON worker FOR INSERT
  WITH CHECK (public.is_super_admin_jwt());

DROP POLICY IF EXISTS "Super admins can delete workers" ON worker;
CREATE POLICY "Super admins can delete workers"
  ON worker FOR DELETE
  USING (public.is_super_admin_jwt());

DROP POLICY IF EXISTS "Super admins can delete organizations" ON organization;
CREATE POLICY "Super admins can delete organizations"
  ON organization FOR DELETE
  USING (public.is_super_admin_jwt());
