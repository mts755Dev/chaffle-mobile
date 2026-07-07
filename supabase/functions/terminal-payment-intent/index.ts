// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Terminal payments use DIRECT CHARGES — same as online payments.
// The PaymentIntent is created on the connected (raffle) account.

import { computeChargeBreakdown } from "../_shared/paymentFees.ts";

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
    const { action, ...body } = await req.json();

    if (action === "create") {
      const { amount, description, metadata, stripeAccount, isApplicationAmount } = body;

      if (!amount) {
        return jsonResponse({ error: "Missing required field: amount" }, 400);
      }

      const baseAmountCents = Math.round(amount * 100);
      const breakdown = computeChargeBreakdown(baseAmountCents, {
        includePlatformFee: !!isApplicationAmount,
        channel: "terminal",
      });

      const params: Record<string, string> = {
        amount: String(breakdown.totalCents),
        currency: "usd",
        "payment_method_types[]": "card_present",
        capture_method: "automatic",
        "metadata[baseAmountCents]": String(breakdown.baseAmountCents),
        "metadata[processingFeeCents]": String(breakdown.processingFeeCents),
        "metadata[platformFeeCents]": String(breakdown.platformFeeCents),
      };

      if (description) params.description = description;

      if (breakdown.platformFeeCents > 0) {
        params.application_fee_amount = String(breakdown.platformFeeCents);
      }

      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          params[`metadata[${key}]`] = String(value);
        }
      }

      const pi = await stripePost("/payment_intents", params, stripeAccount);

      return jsonResponse({
        id: pi.id,
        client_secret: pi.client_secret,
        status: pi.status,
        amount: pi.amount,
        currency: pi.currency,
        chargeBreakdown: breakdown,
      });
    }

    if (action === "cancel") {
      const { paymentIntentId, stripeAccount } = body;
      if (!paymentIntentId) {
        return jsonResponse({ error: "Missing paymentIntentId" }, 400);
      }
      const pi = await stripePost(
        `/payment_intents/${paymentIntentId}/cancel`,
        {},
        stripeAccount,
      );
      return jsonResponse({ id: pi.id, status: pi.status });
    }

    if (action === "capture") {
      const { paymentIntentId, stripeAccount } = body;
      if (!paymentIntentId) {
        return jsonResponse({ error: "Missing paymentIntentId" }, 400);
      }
      const pi = await stripePost(
        `/payment_intents/${paymentIntentId}/capture`,
        {},
        stripeAccount,
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
