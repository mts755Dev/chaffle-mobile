// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Creates worker accounts with email_confirm=true so workers can log in immediately.

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

async function findWorkerByEmail(
  adminClient: ReturnType<typeof getAdminClient>,
  email: string,
) {
  const { data, error } = await adminClient
    .from("worker")
    .select("id, raffle_id, expires_at, email")
    .ilike("email", email)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}

function duplicateWorkerMessage(
  existingRaffleId: string,
  requestedRaffleId: string,
): string {
  if (existingRaffleId === requestedRaffleId) {
    return "A worker with this email already exists for this raffle.";
  }
  return "This email is already registered as a worker for another raffle. Each worker can only be assigned to one raffle.";
}

function mapCreateUserError(message: string | undefined): string {
  const normalized = (message || "").toLowerCase();
  if (
    normalized.includes("already been registered") ||
    normalized.includes("already registered") ||
    normalized.includes("user already exists")
  ) {
    return "This email is already registered. Remove the existing worker account before creating a new one with this email.";
  }
  return message || "Failed to create worker auth user";
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
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const raffleId = String(body?.raffleId || "");
    const organizationId = String(body?.organizationId || "");
    const durationHours = Number(body?.durationHours || 0);

    if (!email || !password || !raffleId || !organizationId || !durationHours) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    // Verify caller owns this organization.
    const { data: organization, error: orgError } = await adminClient
      .from("organization")
      .select("id")
      .eq("id", organizationId)
      .eq("owner_id", user.id)
      .single();

    if (orgError || !organization) {
      return jsonResponse({ error: "You can only create workers for your organization" }, 403);
    }

    // Verify raffle belongs to the same organization.
    const { data: raffle, error: raffleError } = await adminClient
      .from("donation_form")
      .select("id")
      .eq("id", raffleId)
      .eq("organization_id", organizationId)
      .single();

    if (raffleError || !raffle) {
      return jsonResponse({ error: "Invalid raffle for this organization" }, 400);
    }

    let existingWorker;
    try {
      existingWorker = await findWorkerByEmail(adminClient, email);
    } catch (lookupError: unknown) {
      const message =
        lookupError instanceof Error ? lookupError.message : "Failed to verify worker email";
      return jsonResponse({ error: message }, 400);
    }

    if (existingWorker) {
      return jsonResponse(
        { error: duplicateWorkerMessage(existingWorker.raffle_id, raffleId) },
        400,
      );
    }

    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

    // Create auth user with confirmed email.
    const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "worker",
        raffle_id: raffleId,
        organization_id: organizationId,
        expires_at: expiresAt,
      },
    });

    if (createAuthError || !createdAuth?.user) {
      return jsonResponse(
        { error: mapCreateUserError(createAuthError?.message) },
        400,
      );
    }

    const authUserId = createdAuth.user.id;

    // Insert worker profile row.
    const { data: workerRow, error: workerInsertError } = await adminClient
      .from("worker")
      .insert({
        email,
        raffle_id: raffleId,
        organization_id: organizationId,
        created_by: user.id,
        user_id: authUserId,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (workerInsertError) {
      // Roll back auth user to avoid orphaned credentials.
      await adminClient.auth.admin.deleteUser(authUserId);

      const insertMessage = workerInsertError.message || "Failed to create worker profile";
      if (insertMessage.toLowerCase().includes("idx_worker_email_unique")) {
        return jsonResponse(
          {
            error:
              "This email is already registered as a worker for another raffle. Each worker can only be assigned to one raffle.",
          },
          400,
        );
      }

      return jsonResponse({ error: insertMessage }, 400);
    }

    return jsonResponse({ worker: workerRow });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});

