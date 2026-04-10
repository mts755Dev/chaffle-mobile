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

async function stripeRequest(
  method: string,
  path: string,
  params?: Record<string, string>,
  stripeAccount?: string,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${Deno.env.get("STRIPE_KEY")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (stripeAccount) {
    headers["Stripe-Account"] = stripeAccount;
  }

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers,
    body: params ? new URLSearchParams(params).toString() : undefined,
  });

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
    const { action, ...body } = await req.json();

    if (action === "create") {
      const { amount, description, metadata, stripeAccount } = body;

      if (!amount) {
        return jsonResponse({ error: "Missing required field: amount" }, 400);
      }

      const amountInCents = String(Math.round(amount * 100));
      const params: Record<string, string> = {
        amount: amountInCents,
        currency: "usd",
        "payment_method_types[]": "card_present",
        capture_method: "automatic",
      };

      if (description) params.description = description;

      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          params[`metadata[${key}]`] = String(value);
        }
      }

      // Direct charge: created on the connected account so money goes directly there
      const pi = await stripeRequest("POST", "/payment_intents", params, stripeAccount);

      return jsonResponse({
        id: pi.id,
        client_secret: pi.client_secret,
        status: pi.status,
        amount: pi.amount,
        currency: pi.currency,
      });
    }

    if (action === "cancel") {
      const { paymentIntentId } = body;
      if (!paymentIntentId) {
        return jsonResponse({ error: "Missing paymentIntentId" }, 400);
      }
      const pi = await stripeRequest(
        "POST",
        `/payment_intents/${paymentIntentId}/cancel`,
      );
      return jsonResponse({ id: pi.id, status: pi.status });
    }

    if (action === "capture") {
      const { paymentIntentId } = body;
      if (!paymentIntentId) {
        return jsonResponse({ error: "Missing paymentIntentId" }, 400);
      }
      const pi = await stripeRequest(
        "POST",
        `/payment_intents/${paymentIntentId}/capture`,
      );
      return jsonResponse({
        id: pi.id,
        status: pi.status,
        amount: pi.amount,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("terminal-payment-intent error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
