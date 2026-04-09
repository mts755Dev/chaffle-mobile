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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { amount, quantity, email, ticketId, raffleAccount, isApplicationAmount } =
      await req.json();

    if (!amount || !ticketId || !raffleAccount) {
      return jsonResponse({ error: "Missing required fields: amount, ticketId, raffleAccount" }, 400);
    }

    const amountInCents = String(Math.round(amount * 100));

    const params: Record<string, string> = {
      amount: amountInCents,
      currency: "usd",
      "payment_method_types[]": "card",
      "transfer_data[destination]": raffleAccount,
      "metadata[ticketId]": ticketId,
      "metadata[quantity]": String(quantity ?? 1),
      "metadata[email]": email ?? "",
    };

    if (isApplicationAmount) {
      params.application_fee_amount = String(Math.round(Number(amountInCents) * 0.1));
    }

    const paymentIntent = await stripePost("/payment_intents", params);

    return jsonResponse({
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("create-payment-intent error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
