// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Creates a Terminal Onboarding Link for Apple Tap to Pay T&C acceptance.
// Supports allow_relinking to re-trigger T&C for accounts that already accepted.
// When stripeAccount (on_behalf_of) is provided, the link is for that connected account.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_KEY");
    if (!stripeKey) {
      return jsonResponse({ error: "Stripe key not configured" }, 500);
    }

    const {
      merchantDisplayName = "Chaffle",
      allowRelinking = true,
      stripeAccount,
    } = await req.json().catch(() => ({}));

    const params = new URLSearchParams();
    params.append("link_type", "apple_terms_and_conditions");
    params.append(
      "link_options[apple_terms_and_conditions][merchant_display_name]",
      merchantDisplayName,
    );
    params.append(
      "link_options[apple_terms_and_conditions][allow_relinking]",
      String(allowRelinking),
    );

    if (stripeAccount) {
      params.append("on_behalf_of", stripeAccount);
    }

    const res = await fetch(
      "https://api.stripe.com/v1/terminal/onboarding_links",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Stripe error (${res.status})`);
    }

    return jsonResponse({ redirect_url: data.redirect_url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("terminal-onboarding-link error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
