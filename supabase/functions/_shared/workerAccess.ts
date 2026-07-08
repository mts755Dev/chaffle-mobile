// @ts-nocheck — Authorization helpers for worker management edge functions.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function callerOwnsOrganization(
  adminClient: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from("organization")
    .select("id")
    .eq("id", organizationId)
    .eq("owner_id", userId)
    .maybeSingle();

  return !error && !!data;
}

export async function callerCanAccessRaffleWorkers(
  adminClient: SupabaseClient,
  raffleId: string,
  user: { id: string },
  callerIsSuperAdmin: boolean,
): Promise<{ allowed: boolean; organizationId: string | null }> {
  const { data: raffle, error } = await adminClient
    .from("donation_form")
    .select("id, organization_id")
    .eq("id", raffleId)
    .single();

  if (error || !raffle) {
    return { allowed: false, organizationId: null };
  }

  if (callerIsSuperAdmin) {
    return { allowed: true, organizationId: raffle.organization_id ?? null };
  }

  if (!raffle.organization_id) {
    return { allowed: false, organizationId: null };
  }

  const ownsOrg = await callerOwnsOrganization(
    adminClient,
    raffle.organization_id,
    user.id,
  );

  return {
    allowed: ownsOrg,
    organizationId: ownsOrg ? raffle.organization_id : null,
  };
}

export async function callerCanDeleteWorker(
  adminClient: SupabaseClient,
  worker: { id: string; organization_id: string | null; raffle_id?: string },
  user: { id: string },
  callerIsSuperAdmin: boolean,
): Promise<boolean> {
  if (callerIsSuperAdmin) return true;

  if (worker.organization_id) {
    return callerOwnsOrganization(adminClient, worker.organization_id, user.id);
  }

  if (!worker.raffle_id) return false;

  const access = await callerCanAccessRaffleWorkers(
    adminClient,
    worker.raffle_id,
    user,
    false,
  );
  return access.allowed;
}
