// @ts-nocheck — Shared worker expiry + deletion helpers for edge functions.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function isWorkerExpiredAt(
  expiresAt: string | null | undefined,
): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

export async function adminDeleteAuthUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      body?.msg ||
      body?.message ||
      body?.error_description ||
      body?.error ||
      `Failed to delete auth user (${response.status})`;
    throw new Error(String(message));
  }
}

export async function deleteWorkerRecord(
  adminClient: SupabaseClient,
  worker: { id: string; user_id: string | null },
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  if (worker.user_id) {
    await adminDeleteAuthUser(supabaseUrl, serviceRoleKey, worker.user_id);
  }

  const { error } = await adminClient.from("worker").delete().eq("id", worker.id);
  if (error) {
    throw error;
  }
}

type PurgeFilter = {
  email?: string;
  raffleId?: string;
  userId?: string;
};

/** Deletes expired worker rows (and auth users) matching the filter. */
export async function purgeExpiredWorkers(
  adminClient: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  filter: PurgeFilter,
): Promise<number> {
  let query = adminClient
    .from("worker")
    .select("id, user_id, email, expires_at");

  if (filter.email) {
    query = query.ilike("email", filter.email.trim().toLowerCase());
  }
  if (filter.raffleId) {
    query = query.eq("raffle_id", filter.raffleId);
  }
  if (filter.userId) {
    query = query.eq("user_id", filter.userId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  let purged = 0;
  for (const worker of data ?? []) {
    if (!isWorkerExpiredAt(worker.expires_at)) continue;
    await deleteWorkerRecord(adminClient, worker, supabaseUrl, serviceRoleKey);
    purged += 1;
  }

  return purged;
}
