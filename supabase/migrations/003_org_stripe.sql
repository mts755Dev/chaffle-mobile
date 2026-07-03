-- Organization-Level Stripe Connect Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Add Stripe columns to organization table
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_account_json JSONB;

-- 2. Allow org admins to update their own organization (for stripe fields)
CREATE POLICY "Org admins can update own organization"
  ON organization FOR UPDATE
  USING (owner_id = auth.uid());
