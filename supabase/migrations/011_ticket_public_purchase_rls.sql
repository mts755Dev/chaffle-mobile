-- Mobile checkout inserts/updates tickets via the anon/authenticated Supabase
-- client (not Prisma). Mirror website purchase behavior under RLS.
-- Run in Supabase SQL Editor if not applied via migration tooling.

ALTER TABLE ticket ENABLE ROW LEVEL SECURITY;

-- Public + signed-in buyers (and admins previewing) can create tickets
DROP POLICY IF EXISTS "Public can insert tickets" ON ticket;
CREATE POLICY "Public can insert tickets"
  ON ticket FOR INSERT
  TO anon, authenticated
  WITH CHECK ("donation_formId" IS NOT NULL);

-- Required for INSERT ... RETURNING (.select().single()) and free-ticket checks
DROP POLICY IF EXISTS "Public can read tickets" ON ticket;
CREATE POLICY "Public can read tickets"
  ON ticket FOR SELECT
  TO anon, authenticated
  USING (true);

-- Mark paid after Stripe / in-person success (client confirmPaymentSuccess)
DROP POLICY IF EXISTS "Public can update tickets" ON ticket;
CREATE POLICY "Public can update tickets"
  ON ticket FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE ticket TO anon, authenticated;
