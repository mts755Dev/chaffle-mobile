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

async function stripePost(
  path: string,
  params: Record<string, string>,
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
    method: "POST",
    headers,
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
      return jsonResponse(
        { error: "Missing required fields: amount, ticketId, raffleAccount" },
        400,
      );
    }

    // amount = total price for the tier (e.g. $5 for 1 ticket, $10 for 3 tickets)
    const baseAmountCents = Math.round(amount * 100);
    let totalCents = baseAmountCents;
    let feeCents = 0;

    // Match the website: when fee is opted-in, charge the CUSTOMER an extra 10%
    // on top of the base price. The 10% goes to Chaffle as application_fee.
    // The organizer receives the full base price (minus Stripe processing fees).
    if (isApplicationAmount) {
      feeCents = Math.round(baseAmountCents * 0.1);
      totalCents = baseAmountCents + feeCents;
    }

    const params: Record<string, string> = {
      amount: String(totalCents),
      currency: "usd",
      "payment_method_types[]": "card",
      "metadata[ticketId]": ticketId,
      "metadata[quantity]": String(quantity ?? 1),
      "metadata[email]": email ?? "",
    };

    if (feeCents > 0) {
      params.application_fee_amount = String(feeCents);
    }

    // Direct charge: PaymentIntent is created ON the connected account.
    // Money goes directly to the raffle organizer's Stripe account.
    const paymentIntent = await stripePost(
      "/payment_intents",
      params,
      raffleAccount,
    );

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
