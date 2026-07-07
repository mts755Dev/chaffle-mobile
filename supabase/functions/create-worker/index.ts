// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Creates worker accounts with email_confirm=true so workers can log in immediately.

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
  if (normalized.includes("permission denied for schema auth")) {
    return "Worker creation failed due to a server configuration issue. Contact support or redeploy edge functions.";
  }
  if (
    normalized.includes("already been registered") ||
    normalized.includes("already registered") ||
    normalized.includes("user already exists")
  ) {
    return "This email is already registered. Remove the existing worker account before creating a new one with this email.";
  }
  return message || "Failed to create worker auth user";
}

async function adminCreateUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: {
    email: string;
    password: string;
    email_confirm: boolean;
    user_metadata: Record<string, string>;
  },
): Promise<{ id: string }> {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      body?.msg ||
      body?.message ||
      body?.error_description ||
      body?.error ||
      `Auth admin request failed (${response.status})`;
    throw new Error(String(message));
  }

  if (!body?.id) {
    throw new Error("Auth user was created but no user id was returned");
  }

  return { id: body.id };
}

async function adminDeleteUser(
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

async function insertWorkerProfile(
  adminClient: ReturnType<typeof getAdminClient>,
  workerInsert: Record<string, unknown>,
) {
  const { data, error } = await adminClient.rpc("create_worker_profile", {
    p_email: workerInsert.email,
    p_raffle_id: workerInsert.raffle_id,
    p_organization_id: workerInsert.organization_id ?? null,
    p_created_by: workerInsert.created_by,
    p_user_id: workerInsert.user_id,
    p_expires_at: workerInsert.expires_at,
    p_login_password: workerInsert.login_password ?? null,
  });

  if (error) {
    const { data: fallbackData, error: fallbackError } = await adminClient
      .from("worker")
      .insert(workerInsert)
      .select()
      .single();

    if (fallbackError) {
      throw fallbackError;
    }

    return fallbackData;
  }

  return data;
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
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const raffleId = String(body?.raffleId || "");
    const organizationIdParam = body?.organizationId
      ? String(body.organizationId)
      : null;
    const durationHours = Number(body?.durationHours || 0);
    const callerIsSuperAdmin = isSuperAdmin(user);

    if (!email || !password || !raffleId || !durationHours) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const { data: raffle, error: raffleError } = await adminClient
      .from("donation_form")
      .select("id, organization_id")
      .eq("id", raffleId)
      .single();

    if (raffleError || !raffle) {
      return jsonResponse({ error: "Raffle not found" }, 404);
    }

    let resolvedOrganizationId: string | null = raffle.organization_id ?? null;

    if (callerIsSuperAdmin) {
      if (
        organizationIdParam &&
        raffle.organization_id &&
        organizationIdParam !== raffle.organization_id
      ) {
        return jsonResponse(
          { error: "Organization does not match this raffle" },
          400,
        );
      }
    } else {
      if (!organizationIdParam) {
        return jsonResponse({ error: "Missing organizationId" }, 400);
      }

      const { data: organization, error: orgError } = await adminClient
        .from("organization")
        .select("id")
        .eq("id", organizationIdParam)
        .eq("owner_id", user.id)
        .single();

      if (orgError || !organization) {
        return jsonResponse(
          { error: "You can only create workers for your organization" },
          403,
        );
      }

      if (raffle.organization_id !== organizationIdParam) {
        return jsonResponse(
          { error: "Invalid raffle for this organization" },
          400,
        );
      }

      resolvedOrganizationId = organizationIdParam;
    }

    let existingWorker;
    try {
      existingWorker = await findWorkerByEmail(adminClient, email);
    } catch (lookupError: unknown) {
      const message =
        lookupError instanceof Error
          ? lookupError.message
          : "Failed to verify worker email";
      return jsonResponse({ error: message }, 400);
    }

    if (existingWorker) {
      return jsonResponse(
        { error: duplicateWorkerMessage(existingWorker.raffle_id, raffleId) },
        400,
      );
    }

    const expiresAt = new Date(
      Date.now() + durationHours * 60 * 60 * 1000,
    ).toISOString();

    const workerMetadata: Record<string, string> = {
      role: "worker",
      raffle_id: raffleId,
      expires_at: expiresAt,
    };
    if (resolvedOrganizationId) {
      workerMetadata.organization_id = resolvedOrganizationId;
    }

    let authUserId: string;
    try {
      const createdAuth = await adminCreateUser(supabaseUrl, serviceRole, {
        email,
        password,
        email_confirm: true,
        user_metadata: workerMetadata,
      });
      authUserId = createdAuth.id;
    } catch (createAuthError: unknown) {
      const message =
        createAuthError instanceof Error
          ? createAuthError.message
          : "Failed to create worker auth user";
      return jsonResponse({ error: mapCreateUserError(message) }, 400);
    }

    const workerInsert: Record<string, unknown> = {
      email,
      raffle_id: raffleId,
      created_by: user.id,
      user_id: authUserId,
      expires_at: expiresAt,
      login_password: password,
    };
    if (resolvedOrganizationId) {
      workerInsert.organization_id = resolvedOrganizationId;
    }

    try {
      const workerRow = await insertWorkerProfile(adminClient, workerInsert);
      return jsonResponse({ worker: workerRow });
    } catch (workerInsertError: unknown) {
      try {
        await adminDeleteUser(supabaseUrl, serviceRole, authUserId);
      } catch {
        // Best effort rollback if profile insert fails.
      }

      const insertMessage =
        workerInsertError instanceof Error
          ? workerInsertError.message
          : "Failed to create worker profile";
      if (insertMessage.toLowerCase().includes("idx_worker_email_unique")) {
        return jsonResponse(
          {
            error:
              "This email is already registered as a worker for another raffle. Each worker can only be assigned to one raffle.",
          },
          400,
        );
      }

      return jsonResponse({ error: mapCreateUserError(insertMessage) }, 400);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
