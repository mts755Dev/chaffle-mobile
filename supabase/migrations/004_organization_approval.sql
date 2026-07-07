-- Organization approval workflow
-- New orgs default to pending; existing orgs are grandfathered as approved.

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);

-- Existing organizations remain fully operational
UPDATE organization
SET approval_status = 'approved'
WHERE approval_status = 'pending';

ALTER TABLE organization
  ALTER COLUMN approval_status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_organization_approval_status
  ON organization (approval_status);

-- Super admins may approve / reject organizations
DROP POLICY IF EXISTS "Super admins can update organizations" ON organization;
CREATE POLICY "Super admins can update organizations"
  ON organization FOR UPDATE
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Org admins may only create raffles once their organization is approved
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
