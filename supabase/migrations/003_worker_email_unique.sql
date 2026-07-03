-- One worker email may only exist once (case-insensitive).
-- Step 1: If this migration failed before, remove duplicate rows first.

-- Drop duplicate auth logins for worker rows we will remove (keep newest per email).
DELETE FROM auth.users
WHERE id IN (
  SELECT user_id
  FROM (
    SELECT
      user_id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(email)
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM worker
  ) ranked
  WHERE rn > 1
    AND user_id IS NOT NULL
);

-- Remove duplicate worker rows (keep the newest record for each email).
DELETE FROM worker
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(email)
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM worker
  ) ranked
  WHERE rn > 1
);

-- Enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_email_unique
  ON worker (lower(email));
