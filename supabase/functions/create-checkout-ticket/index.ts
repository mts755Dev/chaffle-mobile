// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Creates an unpaid checkout ticket with service_role (bypasses ticket RLS).
// Use for Buy Tickets / free ticket / any public purchase path so a logged-in
// admin session cannot break INSERT via authenticated RLS.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Missing Supabase service env" }, 500);
    }

    const body = await req.json();
    const raffleId = String(body?.raffleId || body?.donation_formId || "").trim();
    const name = String(body?.name || body?.buyerName || "").trim();
    const email = String(body?.email || body?.buyerEmail || "").trim();
    const phone = body?.phone != null ? String(body.phone) : null;
    const address = body?.address != null ? String(body.address) : null;
    const ip = String(body?.ip || "0.0.0.0");
    const amount = Number(body?.amount);
    const quantity = Number(body?.quantity);
    const isFree = !!body?.isFree;
    const paid = !!body?.paid;
    const id =
      typeof body?.id === "string" && body.id.length > 10
        ? body.id
        : crypto.randomUUID();

    if (!raffleId || !name || !email) {
      return jsonResponse(
        { error: "Missing required fields: raffleId, name, email" },
        400,
      );
    }
    if (!Number.isFinite(amount) || !Number.isFinite(quantity) || quantity < 1) {
      return jsonResponse({ error: "Invalid amount or quantity" }, 400);
    }
    if (paid || body?.isWinner) {
      return jsonResponse(
        { error: "Checkout tickets must be unpaid and non-winner" },
        400,
      );
    }

    // Force service_role on every PostgREST call (never inherit caller JWT).
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      },
    });

    const { data: raffle, error: raffleError } = await admin
      .from("donation_form")
      .select("id, winnerTicketId")
      .eq("id", raffleId)
      .maybeSingle();

    if (raffleError) {
      return jsonResponse({ error: raffleError.message }, 500);
    }
    if (!raffle) {
      return jsonResponse({ error: "Raffle not found" }, 404);
    }
    if (raffle.winnerTicketId) {
      return jsonResponse({ error: "This raffle is closed" }, 400);
    }

    const { data: ticket, error: insertError } = await admin
      .from("ticket")
      .insert({
        id,
        buyerName: name,
        buyerEmail: email,
        phone,
        address,
        amount,
        quantity,
        donation_formId: raffleId,
        ip,
        isFree,
        paid: false,
        isWinner: false,
      })
      .select(
        "id, buyerName, buyerEmail, phone, address, amount, quantity, donation_formId, ip, isFree, paid, isWinner, created_at, updated_at",
      )
      .single();

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 400);
    }

    return jsonResponse({ ticket });
  } catch (err) {
    return jsonResponse(
      { error: err?.message || "Failed to create ticket" },
      500,
    );
  }
});
