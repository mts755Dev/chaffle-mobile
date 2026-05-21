-- Worker/Seller Role Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Create worker table
CREATE TABLE IF NOT EXISTS worker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  raffle_id UUID NOT NULL REFERENCES donation_form(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE worker ENABLE ROW LEVEL SECURITY;

-- 3. Org admins can manage workers belonging to their organization
CREATE POLICY "Org admins can read own org workers"
  ON worker FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM organization WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can insert workers for own org"
  ON worker FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT id FROM organization WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can delete own org workers"
  ON worker FOR DELETE
  USING (
    organization_id IN (
      SELECT id FROM organization WHERE owner_id = auth.uid()
    )
  );

-- 4. Workers can read their own record
CREATE POLICY "Workers can read own record"
  ON worker FOR SELECT
  USING (user_id = auth.uid());

-- 5. Super admins can read all workers
CREATE POLICY "Super admins can read all workers"
  ON worker FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 6. Workers can read their assigned raffle
CREATE POLICY "Workers can read assigned raffle"
  ON donation_form FOR SELECT
  USING (
    id IN (
      SELECT raffle_id FROM worker
      WHERE user_id = auth.uid()
        AND expires_at > now()
    )
  );

-- 7. Workers can read tickets for their assigned raffle
CREATE POLICY "Workers can read tickets for assigned raffle"
  ON ticket FOR SELECT
  USING (
    donation_formId IN (
      SELECT raffle_id FROM worker
      WHERE user_id = auth.uid()
        AND expires_at > now()
    )
  );

-- 8. Workers can insert tickets for their assigned raffle
CREATE POLICY "Workers can insert tickets for assigned raffle"
  ON ticket FOR INSERT
  WITH CHECK (
    donation_formId IN (
      SELECT raffle_id FROM worker
      WHERE user_id = auth.uid()
        AND expires_at > now()
    )
  );

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_worker_raffle_id ON worker(raffle_id);
CREATE INDEX IF NOT EXISTS idx_worker_organization_id ON worker(organization_id);
CREATE INDEX IF NOT EXISTS idx_worker_user_id ON worker(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_expires_at ON worker(expires_at);
