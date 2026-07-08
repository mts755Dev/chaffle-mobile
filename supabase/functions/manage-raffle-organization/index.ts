// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Super admin: assign / unassign standalone raffles to organizations.
// On assign, the raffle's Stripe Connect account is copied to the organization
// so org admins and workers can sell tickets using that account.

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

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function parseStripeAccount(raw: unknown): { id: string; json: Record<string, unknown> } | null {
  if (!raw || typeof raw !== "object") return null;
  const account = raw as Record<string, unknown>;
  const id = typeof account.id === "string" ? account.id : null;
  if (!id) return null;
  return { id, json: account };
}

async function syncOrganizationStripeFromRaffles(
  adminClient: ReturnType<typeof getAdminClient>,
  organizationId: string,
): Promise<void> {
  const { data: raffles, error } = await adminClient
    .from("donation_form")
    .select("id, stripeAccount, updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  let chosen: { id: string; json: Record<string, unknown> } | null = null;
  for (const raffle of raffles ?? []) {
    const stripe = parseStripeAccount(raffle.stripeAccount);
    if (stripe) {
      chosen = stripe;
      break;
    }
  }

  const { error: updateError } = await adminClient
    .from("organization")
    .update(
      chosen
        ? {
            stripe_account_id: chosen.id,
            stripe_account_json: chosen.json,
          }
        : {
            stripe_account_id: null,
            stripe_account_json: null,
          },
    )
    .eq("id", organizationId);

  if (updateError) {
    throw updateError;
  }
}

async function syncWorkersForRaffle(
  adminClient: ReturnType<typeof getAdminClient>,
  raffleId: string,
  organizationId: string | null,
  organizationName: string | null,
): Promise<void> {
  const { data: workers, error } = await adminClient
    .from("worker")
    .select("id, user_id")
    .eq("raffle_id", raffleId);

  if (error) {
    throw error;
  }

  const { error: workerUpdateError } = await adminClient
    .from("worker")
    .update({ organization_id: organizationId })
    .eq("raffle_id", raffleId);

  if (workerUpdateError) {
    throw workerUpdateError;
  }

  for (const worker of workers ?? []) {
    if (!worker.user_id) continue;

    const { data: authUser, error: authReadError } =
      await adminClient.auth.admin.getUserById(worker.user_id);
    if (authReadError || !authUser?.user) continue;

    const existingMetadata = authUser.user.user_metadata ?? {};
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      worker.user_id,
      {
        user_metadata: {
          ...existingMetadata,
          organization_id: organizationId,
          organization_name: organizationName,
        },
      },
    );

    if (authUpdateError) {
      throw authUpdateError;
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    if (action === "assign") {
      const raffleId = String(body?.raffleId || "");
      const organizationId = String(body?.organizationId || "");

      if (!raffleId || !organizationId) {
        return jsonResponse({ error: "raffleId and organizationId are required" }, 400);
      }

      const { data: raffle, error: raffleError } = await adminClient
        .from("donation_form")
        .select("id, organization_id, stripeAccount, title")
        .eq("id", raffleId)
        .single();

      if (raffleError || !raffle) {
        return jsonResponse({ error: "Raffle not found" }, 404);
      }

      if (raffle.organization_id) {
        return jsonResponse(
          { error: "This raffle is already linked to an organization. Unassign it first." },
          400,
        );
      }

      const stripe = parseStripeAccount(raffle.stripeAccount);
      if (!stripe) {
        return jsonResponse(
          { error: "This raffle must have Stripe connected before it can be assigned to an organization." },
          400,
        );
      }

      const { data: organization, error: orgError } = await adminClient
        .from("organization")
        .select("id, name, approval_status")
        .eq("id", organizationId)
        .single();

      if (orgError || !organization) {
        return jsonResponse({ error: "Organization not found" }, 404);
      }

      if (organization.approval_status !== "approved") {
        return jsonResponse(
          { error: "Only approved organizations can be linked to a raffle." },
          400,
        );
      }

      const { data: updatedRaffle, error: assignError } = await adminClient
        .from("donation_form")
        .update({ organization_id: organizationId })
        .eq("id", raffleId)
        .select("id, organization_id, title, stripeAccount")
        .single();

      if (assignError) {
        return jsonResponse({ error: assignError.message }, 500);
      }

      const { error: orgStripeError } = await adminClient
        .from("organization")
        .update({
          stripe_account_id: stripe.id,
          stripe_account_json: stripe.json,
        })
        .eq("id", organizationId);

      if (orgStripeError) {
        await adminClient
          .from("donation_form")
          .update({ organization_id: null })
          .eq("id", raffleId);
        return jsonResponse({ error: orgStripeError.message }, 500);
      }

      try {
        await syncWorkersForRaffle(
          adminClient,
          raffleId,
          organizationId,
          organization.name,
        );
      } catch (workerError: unknown) {
        const message =
          workerError instanceof Error
            ? workerError.message
            : "Failed to update workers for this raffle";
        return jsonResponse({ error: message }, 500);
      }

      return jsonResponse({
        success: true,
        raffle: updatedRaffle,
        organization,
        stripeAccountId: stripe.id,
      });
    }

    if (action === "unassign") {
      const raffleId = String(body?.raffleId || "");
      if (!raffleId) {
        return jsonResponse({ error: "raffleId is required" }, 400);
      }

      const { data: raffle, error: raffleError } = await adminClient
        .from("donation_form")
        .select("id, organization_id, title")
        .eq("id", raffleId)
        .single();

      if (raffleError || !raffle) {
        return jsonResponse({ error: "Raffle not found" }, 404);
      }

      const previousOrganizationId = raffle.organization_id as string | null;
      if (!previousOrganizationId) {
        return jsonResponse({ error: "This raffle is not linked to an organization." }, 400);
      }

      const { data: updatedRaffle, error: unassignError } = await adminClient
        .from("donation_form")
        .update({ organization_id: null })
        .eq("id", raffleId)
        .select("id, organization_id, title, stripeAccount")
        .single();

      if (unassignError) {
        return jsonResponse({ error: unassignError.message }, 500);
      }

      try {
        await syncOrganizationStripeFromRaffles(adminClient, previousOrganizationId);
        await syncWorkersForRaffle(adminClient, raffleId, null, null);
      } catch (syncError: unknown) {
        const message =
          syncError instanceof Error ? syncError.message : "Failed to finalize unassign";
        return jsonResponse({ error: message }, 500);
      }

      return jsonResponse({
        success: true,
        raffle: updatedRaffle,
        previousOrganizationId,
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
