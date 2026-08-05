// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Super-admin organization approval: list, count pending, approve/reject.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSuperAdmin } from "../_shared/drawAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type OrgFilter = "pending" | "approved" | "rejected" | "terminated" | "all";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function deleteRaffleData(
  adminClient: ReturnType<typeof getAdminClient>,
  raffleId: string,
): Promise<void> {
  await adminClient.from("draw_audit").delete().eq("raffleId", raffleId);
  await adminClient.from("secure_link").delete().eq("raffleId", raffleId);
  await adminClient.from("ticket").delete().eq("donation_formId", raffleId);

  const { error } = await adminClient
    .from("donation_form")
    .delete()
    .eq("id", raffleId);

  if (error) {
    throw error;
  }
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

    const adminClient = getAdminClient();
    const token = authHeader.replace("Bearer ", "").trim();

    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (!isSuperAdmin(user)) {
      return jsonResponse({ error: "Super admin access required" }, 403);
    }

    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "list") {
      const filter = (body?.filter || "all") as OrgFilter;
      let query = adminClient
        .from("organization")
        .select("*")
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("approval_status", filter);
      }

      const { data, error } = await query;
      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ organizations: data ?? [] });
    }

    if (action === "list-by-ids") {
      const organizationIds = Array.isArray(body?.organizationIds)
        ? body.organizationIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];

      if (organizationIds.length === 0) {
        return jsonResponse({ organizations: [] });
      }

      const { data, error } = await adminClient
        .from("organization")
        .select("*")
        .in("id", organizationIds);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ organizations: data ?? [] });
    }

    if (action === "count-pending") {
      const { count, error } = await adminClient
        .from("organization")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending");

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ count: count ?? 0 });
    }

    if (action === "update-status") {
      const organizationId = String(body?.organizationId || "");
      const status = String(body?.status || "");
      if (!organizationId || (status !== "approved" && status !== "rejected")) {
        return jsonResponse({ error: "Invalid organization or status" }, 400);
      }

      const { data: org, error: orgError } = await adminClient
        .from("organization")
        .select("id, approval_status")
        .eq("id", organizationId)
        .single();

      if (orgError || !org) {
        return jsonResponse({ error: "Organization not found" }, 404);
      }

      if (org.approval_status === "terminated") {
        return jsonResponse({ error: "Terminated organizations cannot be updated" }, 400);
      }

      const payload =
        status === "approved"
          ? {
              approval_status: status,
              approved_at: new Date().toISOString(),
              approved_by: user.id,
            }
          : {
              approval_status: status,
              approved_at: null,
              approved_by: user.id,
            };

      const { data, error } = await adminClient
        .from("organization")
        .update(payload)
        .eq("id", organizationId)
        .select("*")
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ organization: data });
    }

    if (action === "terminate") {
      const organizationId = String(body?.organizationId || "");
      if (!organizationId) {
        return jsonResponse({ error: "Missing organizationId" }, 400);
      }

      const { data: org, error: orgError } = await adminClient
        .from("organization")
        .select("id, owner_id, name, approval_status")
        .eq("id", organizationId)
        .single();

      if (orgError || !org) {
        return jsonResponse({ error: "Organization not found" }, 404);
      }

      if (org.approval_status === "terminated") {
        return jsonResponse({ error: "Organization is already terminated" }, 400);
      }

      if (org.approval_status !== "approved") {
        return jsonResponse(
          { error: "Only approved organizations can be terminated" },
          400,
        );
      }

      const { data: workers, error: workersError } = await adminClient
        .from("worker")
        .select("id, user_id")
        .eq("organization_id", organizationId);

      if (workersError) {
        return jsonResponse({ error: workersError.message }, 500);
      }

      for (const worker of workers ?? []) {
        if (worker.user_id) {
          const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(
            worker.user_id,
          );
          if (deleteAuthError) {
            return jsonResponse(
              { error: deleteAuthError.message || "Failed to delete worker login" },
              400,
            );
          }
        }
      }

      const { error: deleteWorkersError } = await adminClient
        .from("worker")
        .delete()
        .eq("organization_id", organizationId);

      if (deleteWorkersError) {
        return jsonResponse({ error: deleteWorkersError.message }, 500);
      }

      const { data: orgRaffles, error: rafflesError } = await adminClient
        .from("donation_form")
        .select("id")
        .eq("organization_id", organizationId);

      if (rafflesError) {
        return jsonResponse({ error: rafflesError.message }, 500);
      }

      let deletedRaffles = 0;

      for (const raffle of orgRaffles ?? []) {
        try {
          await deleteRaffleData(adminClient, raffle.id);
          deletedRaffles += 1;
        } catch (deleteError: unknown) {
          const message =
            deleteError instanceof Error
              ? deleteError.message
              : "Failed to delete raffle data";
          return jsonResponse({ error: message }, 500);
        }
      }

      const ownerId = org.owner_id as string | null;

      // Remove organization row before deleting the auth user so email can be
      // reused on signup (auth delete must not be a ban).
      const { error: deleteOrgError } = await adminClient
        .from("organization")
        .delete()
        .eq("id", organizationId);

      if (deleteOrgError) {
        return jsonResponse({ error: deleteOrgError.message }, 500);
      }

      if (ownerId) {
        const { error: deleteOwnerError } = await adminClient.auth.admin.deleteUser(
          ownerId,
        );
        if (deleteOwnerError) {
          return jsonResponse(
            {
              error:
                deleteOwnerError.message ||
                "Failed to delete organization admin login",
            },
            400,
          );
        }
      }

      return jsonResponse({
        success: true,
        deletedRaffles,
        deletedWorkers: (workers ?? []).length,
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
