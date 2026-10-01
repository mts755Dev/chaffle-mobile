// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Creates a PaymentIntent on the connected raffle/org Stripe account for the
// mobile Payment Sheet (same direct-charge model as terminal-payment-intent).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeChargeBreakdown } from "../_shared/paymentFees.ts";
import {
  assertValidTicketPricing,
  isValidPaidTicketPricing,
} from "../_shared/ticketPricing.ts";

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
    if (!Deno.env.get("STRIPE_KEY")?.trim()) {
      return jsonResponse(
        { error: "STRIPE_KEY is not configured on the create-payment-intent function" },
        500,
      );
    }

    const { amount, quantity, email, ticketId, raffleAccount, isApplicationAmount } =
      await req.json();

    if (!amount || !ticketId || !raffleAccount) {
      return jsonResponse(
        { error: "Missing required fields: amount, ticketId, raffleAccount" },
        400,
      );
    }

    const amountNum = Number(amount);
    const quantityNum = Number(quantity ?? 1);
    try {
      assertValidTicketPricing({ amount: amountNum, quantity: quantityNum });
    } catch (e) {
      return jsonResponse(
        { error: e instanceof Error ? e.message : "Invalid ticket pricing" },
        400,
      );
    }

    const baseAmountCents = Math.round(amountNum * 100);
    if (!Number.isFinite(baseAmountCents) || baseAmountCents < 50) {
      return jsonResponse({ error: "Invalid ticket amount" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ticket, error: loadError } = await supabaseAdmin
      .from("ticket")
      .select("id, amount, quantity, paid, isFree")
      .eq("id", ticketId)
      .maybeSingle();

    if (loadError) {
      return jsonResponse({ error: loadError.message }, 500);
    }
    if (!ticket) {
      return jsonResponse({ error: "Ticket not found" }, 404);
    }
    if (ticket.paid) {
      return jsonResponse({ error: "Ticket is already paid" }, 400);
    }
    if (ticket.isFree) {
      return jsonResponse({ error: "Free tickets do not require payment" }, 400);
    }

    const ticketAmount = Number(ticket.amount);
    const ticketQty = Number(ticket.quantity);
    if (
      ticketAmount !== amountNum ||
      ticketQty !== quantityNum ||
      !isValidPaidTicketPricing(ticketAmount, ticketQty)
    ) {
      return jsonResponse(
        {
          error:
            "Ticket amount/quantity mismatch or invalid pricing — payment refused",
        },
        400,
      );
    }

    const breakdown = computeChargeBreakdown(baseAmountCents, {
      includePlatformFee: !!isApplicationAmount,
      channel: "online",
    });

    const params: Record<string, string> = {
      amount: String(breakdown.totalCents),
      currency: "usd",
      "automatic_payment_methods[enabled]": "true",
      "metadata[ticketId]": ticketId,
      "metadata[quantity]": String(ticketQty),
      "metadata[baseAmountCents]": String(breakdown.baseAmountCents),
      "metadata[processingFeeCents]": String(breakdown.processingFeeCents),
      "metadata[platformFeeCents]": String(breakdown.platformFeeCents),
    };

    if (email) {
      params.receipt_email = email;
    }

    if (breakdown.platformFeeCents > 0) {
      params.application_fee_amount = String(breakdown.platformFeeCents);
    }

    const paymentIntent = await stripePost(
      "/payment_intents",
      params,
      raffleAccount,
    );

    if (!paymentIntent?.client_secret) {
      throw new Error("PaymentIntent created but client_secret is missing");
    }

    const stripeSession = {
      paymentIntentId: paymentIntent.id,
      id: paymentIntent.id,
      status: paymentIntent.status,
    };

    const { error: ticketError } = await supabaseAdmin
      .from("ticket")
      .update({ stripeSession })
      .eq("id", ticketId);
    if (ticketError) {
      throw new Error(
        ticketError.message || "Failed to save stripeSession on ticket",
      );
    }

    return jsonResponse({
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id,
      stripeSession,
      chargeBreakdown: breakdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("create-payment-intent error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
