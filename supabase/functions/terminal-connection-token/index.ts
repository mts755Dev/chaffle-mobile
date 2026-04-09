// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.

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

    const res = await fetch(
      "https://api.stripe.com/v1/terminal/connection_tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "",
      },
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Stripe error (${res.status})`);
    }

    return jsonResponse({ secret: data.secret });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("terminal-connection-token error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
