# Harden org/worker claims + ticket amount/quantity (024)

## Apply SQL

In the Supabase SQL Editor (project linked to chaffle-mobile), run:

`chaffle-mobile/supabase/migrations/024_lock_org_worker_claims.sql`

Safe to re-run. This:

- Makes `is_org_admin_jwt()` true only when `organization.owner_id = auth.uid()`
- Re-affirms `owns_organization` / `is_worker_for_raffle` / `can_manage_raffle` are DB-backed
- Adds `ticket_pricing_ok` + `ticket_pricing_guard` so unbound amount/quantity rows cannot land

## Redeploy edges

From `chaffle-mobile`:

```bash
./scripts/deploy-security-edges.sh
```

Must include at least: `create-payment-intent`, `create-checkout-ticket`, `upload-raffle-image`, and web `raffle-draw`.

## Smoke checks

1. **Forge org admin** — signed-in user runs `auth.updateUser({ data: { role: 'org_admin', organization_id: '<victim-org-id>' } })` then refreshes.
   - Expect: no victim org raffles, no Stripe Connect for victim, mutations 403.
2. **Forge worker** — `auth.updateUser({ data: { role: 'worker', raffle_id: '<victim-raffle>' } })` without a `worker` row.
   - Expect: mobile login rejected / web worker area redirects; no ticket sell for victim.
3. **Underpay entries** — checkout or PaymentIntent with `amount=1`, `quantity=10000`.
   - Expect: rejected (web `startRaffleCheckout`, edge `create-payment-intent` / `create-checkout-ticket`, and SQL trigger).
4. **Valid preset** — `amount=5`, `quantity=1` (or other presets / custom `>250` with `qty = amount×3`) succeeds.
