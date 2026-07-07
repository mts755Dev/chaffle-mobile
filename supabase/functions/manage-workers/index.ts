// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Worker list/create/delete via service role (avoids PostgREST auth schema issues for super admins).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSuperAdmin } from "../_shared/drawAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAdminClient(serviceRoleKey: string) {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function callerOwnsOrganization(
  adminClient: ReturnType<typeof getAdminClient>,
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

async function callerCanAccessRaffleWorkers(
  adminClient: ReturnType<typeof getAdminClient>,
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) {
      return jsonResponse({ error: "Missing Supabase service env variables" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const adminClient = getAdminClient(serviceRole);
    const token = authHeader.replace("Bearer ", "").trim();

    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const action = String(body?.action || "");
    const callerIsSuperAdmin = isSuperAdmin(user);

    if (action === "list-by-raffle") {
      const raffleId = String(body?.raffleId || "").trim();
      if (!raffleId) {
        return jsonResponse({ error: "Missing raffleId" }, 400);
      }

      const access = await callerCanAccessRaffleWorkers(
        adminClient,
        raffleId,
        user,
        callerIsSuperAdmin,
      );

      if (!access.allowed) {
        return jsonResponse({ error: "You cannot view workers for this raffle" }, 403);
      }

      const { data, error } = await adminClient
        .from("worker")
        .select("*")
        .eq("raffle_id", raffleId)
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ workers: data ?? [] });
    }

    if (action === "create") {
      const createResponse = await fetch(`${supabaseUrl}/functions/v1/create-worker`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          apikey: serviceRole,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: body?.email,
          password: body?.password,
          raffleId: body?.raffleId,
          organizationId: body?.organizationId ?? null,
          durationHours: body?.durationHours,
        }),
      });

      const createBody = await createResponse.json().catch(() => ({}));
      return jsonResponse(createBody, createResponse.status);
    }

    if (action === "delete") {
      const deleteResponse = await fetch(`${supabaseUrl}/functions/v1/delete-worker`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          apikey: serviceRole,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: body?.workerId }),
      });

      const deleteBody = await deleteResponse.json().catch(() => ({}));
      return jsonResponse(deleteBody, deleteResponse.status);
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
