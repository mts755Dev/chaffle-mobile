#!/usr/bin/env bash
# Deploy security-sensitive edge functions after 016/017 + drawAuth hardening.
# Run from repo that owns the linked Supabase project (usually chaffle-mobile).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FUNCTIONS=(
  manage-organizations
  manage-raffle-organization
  manage-workers
  create-worker
  delete-worker
  manage-custom-domain
  upload-raffle-image
)

echo "Deploying mobile edge functions from $ROOT ..."
for fn in "${FUNCTIONS[@]}"; do
  echo "→ $fn"
  npx supabase functions deploy "$fn" --no-verify-jwt
done

WEB_ROOT="$(cd "$ROOT/../chaffle" && pwd)"
if [[ -d "$WEB_ROOT/supabase/functions" ]]; then
  echo "Deploying web edge functions from $WEB_ROOT ..."
  cd "$WEB_ROOT"
  for fn in raffle-draw send-email send-winner-email send-purchase-email; do
    if [[ -d "supabase/functions/$fn" ]]; then
      echo "→ $fn"
      npx supabase functions deploy "$fn" --no-verify-jwt
    fi
  done
fi

echo "Done. Apply SQL 016 → 017 → 018 (verify) in Supabase SQL Editor if not already applied."
