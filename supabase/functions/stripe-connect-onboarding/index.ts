// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Handles Stripe Connect onboarding for organizations.
// Actions:
//   "create"  — Creates a Stripe account + onboarding link for an organization
//   "refresh" — Retrieves current account status and updates the organization row

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

async function stripePost(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("STRIPE_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error (${res.status})`);
  }
  return data;
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${Deno.env.get("STRIPE_KEY")}`,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error (${res.status})`);
  }
  return data;
}

function getSupabaseAdmin() {
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
    const { action, organizationId } = await req.json();

    if (!organizationId) {
      return jsonResponse({ error: "Missing organizationId" }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const baseUrl = Deno.env.get("PUBLIC_BASE_URL") || "https://chaffle.org";

    if (action === "create") {
      // Check if org already has a stripe account
      const { data: org } = await supabaseAdmin
        .from("organization")
        .select("stripe_account_id")
        .eq("id", organizationId)
        .single();

      if (org?.stripe_account_id) {
        // Account already exists, just create a new onboarding link
        const accountLink = await stripePost("/account_links", {
          account: org.stripe_account_id,
          refresh_url: `${baseUrl}/api/stripe/account/${org.stripe_account_id}/verify`,
          return_url: `${baseUrl}/api/stripe/account/${org.stripe_account_id}/verify`,
          type: "account_onboarding",
        });

        return jsonResponse({
          accountId: org.stripe_account_id,
          onboardingUrl: accountLink.url,
        });
      }

      // Create new Stripe Connect account
      const account = await stripePost("/accounts", {
        "metadata[organizationId]": organizationId,
        "controller[losses][payments]": "stripe",
        "controller[fees][payer]": "account",
        "controller[stripe_dashboard][type]": "full",
      });

      // Save stripe_account_id to organization
      await supabaseAdmin
        .from("organization")
        .update({ stripe_account_id: account.id })
        .eq("id", organizationId);

      // Create onboarding link
      const accountLink = await stripePost("/account_links", {
        account: account.id,
        refresh_url: `${baseUrl}/api/stripe/account/${account.id}/verify`,
        return_url: `${baseUrl}/api/stripe/account/${account.id}/verify`,
        type: "account_onboarding",
      });

      return jsonResponse({
        accountId: account.id,
        onboardingUrl: accountLink.url,
      });
    }

    if (action === "refresh") {
      const { data: org } = await supabaseAdmin
        .from("organization")
        .select("stripe_account_id")
        .eq("id", organizationId)
        .single();

      if (!org?.stripe_account_id) {
        return jsonResponse({ error: "No Stripe account found for this organization" }, 404);
      }

      const account = await stripeGet(`/accounts/${org.stripe_account_id}`);

      await supabaseAdmin
        .from("organization")
        .update({ stripe_account_json: account })
        .eq("id", organizationId);

      return jsonResponse({
        charges_enabled: account.charges_enabled,
        details_submitted: account.details_submitted,
        payouts_enabled: account.payouts_enabled,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("stripe-connect-onboarding error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
