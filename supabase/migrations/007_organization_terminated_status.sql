-- Soft-terminate organizations: keep record with approval_status = 'terminated'

ALTER TABLE organization
  DROP CONSTRAINT IF EXISTS organization_approval_status_check;

ALTER TABLE organization
  ADD CONSTRAINT organization_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected', 'terminated'));

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS terminated_by UUID REFERENCES auth.users(id);

-- Terminated orgs cannot create raffles (same as rejected/pending)
DROP POLICY IF EXISTS "Org admins can insert raffles" ON donation_form;
CREATE POLICY "Org admins can insert raffles"
  ON donation_form FOR INSERT
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR organization_id IN (
      SELECT id FROM organization
      WHERE owner_id = auth.uid() AND approval_status = 'approved'
    )
  );
