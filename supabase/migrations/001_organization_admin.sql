-- Organization Admin Role Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Create organization table
CREATE TABLE IF NOT EXISTS organization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add organization_id to donation_form (nullable to preserve existing data)
ALTER TABLE donation_form
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organization(id) ON DELETE SET NULL;

-- 3. Enable RLS on organization table
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;

-- 4. Policies for organization table
CREATE POLICY "Users can read their own organization"
  ON organization FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own organization"
  ON organization FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Super admins can read all organizations"
  ON organization FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 5. Policy for donation_form: org admins see only their raffles
CREATE POLICY "Org admins can read own raffles"
  ON donation_form FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT id FROM organization WHERE owner_id = auth.uid()
    )
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Org admins can update own raffles"
  ON donation_form FOR UPDATE
  USING (
    organization_id IN (
      SELECT id FROM organization WHERE owner_id = auth.uid()
    )
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Org admins can insert raffles"
  ON donation_form FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT id FROM organization WHERE owner_id = auth.uid()
    )
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 6. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_donation_form_organization_id ON donation_form(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_owner_id ON organization(owner_id);
