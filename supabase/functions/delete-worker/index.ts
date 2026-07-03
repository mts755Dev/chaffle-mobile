// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Deletes a worker profile and its auth user so the email can be reused.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
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

    const body = await req.json();
    const workerId = String(body?.workerId || "").trim();

    if (!workerId) {
      return jsonResponse({ error: "Missing workerId" }, 400);
    }

    const { data: worker, error: workerError } = await adminClient
      .from("worker")
      .select("id, user_id, organization_id, email")
      .eq("id", workerId)
      .single();

    if (workerError || !worker) {
      return jsonResponse({ error: "Worker not found" }, 404);
    }

    const { data: organization, error: orgError } = await adminClient
      .from("organization")
      .select("id")
      .eq("id", worker.organization_id)
      .eq("owner_id", user.id)
      .single();

    if (orgError || !organization) {
      return jsonResponse(
        { error: "You can only delete workers for your organization" },
        403,
      );
    }

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

    const { error: deleteWorkerError } = await adminClient
      .from("worker")
      .delete()
      .eq("id", workerId);

    if (deleteWorkerError) {
      return jsonResponse(
        { error: deleteWorkerError.message || "Failed to delete worker profile" },
        400,
      );
    }

    return jsonResponse({ success: true, email: worker.email });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
