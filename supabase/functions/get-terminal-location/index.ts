// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Gets or creates a Terminal location.
// When stripeAccount is provided, the location is created on the connected
// account (direct-charge flow). Otherwise it defaults to the platform.

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

async function stripeRequest(
  method: string,
  path: string,
  params?: Record<string, string>,
  stripeAccount?: string,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${Deno.env.get("STRIPE_KEY")}`,
  };

  if (stripeAccount) {
    headers["Stripe-Account"] = stripeAccount;
  }

  const options: RequestInit = { method, headers };

  if (method === "POST" && params) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = new URLSearchParams(params).toString();
  }

  const url =
    method === "GET" && params
      ? `https://api.stripe.com/v1${path}?${new URLSearchParams(params)}`
      : `https://api.stripe.com/v1${path}`;

  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error (${res.status})`);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { stripeAccount } = await req.json().catch(() => ({}));

    const locations = await stripeRequest(
      "GET",
      "/terminal/locations",
      { limit: "1" },
      stripeAccount,
    );

    if (locations.data?.length > 0) {
      return jsonResponse({ locationId: locations.data[0].id });
    }

    const location = await stripeRequest(
      "POST",
      "/terminal/locations",
      {
        display_name: "Chaffle Mobile",
        "address[line1]": "Default",
        "address[city]": "New York",
        "address[state]": "NY",
        "address[postal_code]": "10001",
        "address[country]": "US",
      },
      stripeAccount,
    );

    return jsonResponse({ locationId: location.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("get-terminal-location error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
