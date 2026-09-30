/**
 * Mobile ↔ Supabase data access under RLS.
 *
 * TWO CLIENTS (see services/supabase/client.ts):
 *
 *   supabasePublic  — no JWT. Use for catalogue SELECTs that RLS marks public:
 *                     donation_form (all), ticket where paid OR recent OR winners.
 *   supabase        — user JWT. Use for writes + private manager rows
 *                     (workers, secure_link, org updates, unpaid ticket admin export).
 *
 * Edge functions (service_role) — Stripe, draw, emails, org/worker admin mutations.
 *
 * Rule: if a screen only *displays* a raffle / paid pot / winners, use public.
 *       If it *mutates* or needs unpaid PII older than 2h, use authenticated JWT
 *       (requires can_manage_raffle / is_super_admin_jwt policies from 013/014).
 */

export const PUBLIC_READ_TABLES = [
  'donation_form',
  'ticket', // paid + recent + winners under public SELECT policy
] as const;

export const AUTH_WRITE_TABLES = [
  'donation_form',
  'ticket',
  'organization',
  'worker',
  'secure_link',
  'draw_audit',
] as const;
