// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Raffle draw for the mobile app — same algorithm and DB updates as web
// executeRaffleDraw / autoDrawRaffleIfDue. Actions:
//   "draw"       — admin manual draw (requires auth: super_admin or org_admin)
//   "auto-draw"  — draw when draw_date has passed (no auth, mirrors web)

import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";
import { createTransport } from "npm:nodemailer@6.9.14";
import {
  getTicketReferenceId,
  isDrawDue,
  pickWeightedWinner,
} from "../_shared/raffleDrawAlgorithm.ts";
import { canManualDraw, isSuperAdmin } from "../_shared/drawAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type AdminClient = ReturnType<typeof getAdminClient>;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getUserFromRequest(req: Request): Promise<User | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  const admin = getAdminClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

async function assertOrgAdminCanDrawRaffle(
  admin: AdminClient,
  user: User,
  raffleId: string,
): Promise<Response | null> {
  if (isSuperAdmin(user)) return null;

  const orgId = user.user_metadata?.organization_id as string | undefined;
  if (!orgId) {
    return jsonResponse({ error: "Unauthorized: admin role required" }, 403);
  }

  const { data: raffle, error } = await admin
    .from("donation_form")
    .select("organization_id")
    .eq("id", raffleId)
    .maybeSingle();

  if (error || !raffle || raffle.organization_id !== orgId) {
    return jsonResponse({ error: "Unauthorized: admin role required" }, 403);
  }

  return null;
}

async function sendWinnerEmail(
  buyerEmail: string,
  ticketId: string,
  raffleId: string,
): Promise<void> {
  const adminEmail = Deno.env.get("ADMIN_EMAIL");
  const adminPassword = Deno.env.get("ADMIN_PASSWORD");
  if (!adminEmail || !adminPassword) {
    console.warn("Winner email skipped: ADMIN_EMAIL or ADMIN_PASSWORD not set");
    return;
  }

  const ticketNumber = getTicketReferenceId(ticketId);
  const transporter = createTransport({
    host: "smtpout.secureserver.net",
    port: 465,
    secure: true,
    auth: { user: adminEmail, pass: adminPassword },
  });

  await transporter.sendMail({
    from: adminEmail,
    to: buyerEmail,
    subject: "Congratulations! Winner",
    html: `<!DOCTYPE html><html><body style="font-family:arial,sans-serif;padding:20px;">
      <p><strong>Congrats, Winner!</strong></p>
      <p>Your winning ticket reference is <strong>#${ticketNumber}</strong>.</p>
      <p>Visit <a href="https://chaffle.org/donation/${raffleId}">chaffle.org</a> for details on how to claim your prize.</p>
    </body></html>`,
  });
}

/**
 * Core draw — mirrors chaffle/lib/executeRaffleDraw.ts transaction steps.
 */
async function executeRaffleDraw(
  admin: AdminClient,
  raffleId: string,
  drawnByUserId: string | null,
) {
  const { data: raffle, error: raffleError } = await admin
    .from("donation_form")
    .select("*")
    .eq("id", raffleId)
    .maybeSingle();

  if (raffleError) throw raffleError;
  if (!raffle) throw new Error("Raffle not found");

  if (raffle.winnerTicketId) {
    const { data: existing, error: ticketError } = await admin
      .from("ticket")
      .select("*")
      .eq("id", raffle.winnerTicketId)
      .maybeSingle();

    if (ticketError) throw ticketError;
    if (!existing) throw new Error("Winner ticket record missing");

    return {
      winnerTicket: existing,
      totalEntries: 0,
      randomValue: -1,
      rngMethod: "node.crypto.randomInt" as const,
      alreadyDrawn: true,
    };
  }

  const { data: candidates, error: candidatesError } = await admin
    .from("ticket")
    .select("id, quantity")
    .eq("donation_formId", raffleId)
    .eq("paid", true)
    .order("created_at", { ascending: true });

  if (candidatesError) throw candidatesError;

  const result = pickWeightedWinner(candidates ?? []);

  const { data: updatedRows, error: updateError } = await admin
    .from("donation_form")
    .update({
      winnerTicketId: result.winnerTicketId,
      drawCompletedAt: new Date().toISOString(),
    })
    .eq("id", raffleId)
    .is("winnerTicketId", null)
    .select("id");

  if (updateError) throw updateError;
  if (!updatedRows?.length) {
    throw new Error("Winner already drawn (concurrent request lost the race)");
  }

  const { data: winnerTicket, error: winnerError } = await admin
    .from("ticket")
    .update({ isWinner: true })
    .eq("id", result.winnerTicketId)
    .select("*")
    .single();

  if (winnerError) throw winnerError;

  const { error: auditError } = await admin.from("draw_audit").insert({
    raffleId,
    drawnByUserId,
    rngMethod: result.rngMethod,
    totalEntries: result.totalEntries,
    randomValue: result.randomValue,
    winnerTicketId: result.winnerTicketId,
    eligibleTicketsSnapshot: result.snapshot,
  });

  if (auditError) throw auditError;

  return {
    winnerTicket,
    totalEntries: result.totalEntries,
    randomValue: result.randomValue,
    rngMethod: result.rngMethod,
    alreadyDrawn: false,
  };
}

async function autoDrawRaffleIfDue(admin: AdminClient, raffleId: string) {
  const { data: raffle, error } = await admin
    .from("donation_form")
    .select("id, draw_date, winnerTicketId")
    .eq("id", raffleId)
    .maybeSingle();

  if (error) throw error;
  if (!raffle || raffle.winnerTicketId || !isDrawDue(raffle.draw_date)) {
    return null;
  }

  try {
    const result = await executeRaffleDraw(admin, raffleId, null);
    if (!result.alreadyDrawn) {
      try {
        await sendWinnerEmail(
          result.winnerTicket.buyerEmail,
          result.winnerTicket.id,
          raffleId,
        );
      } catch (emailErr) {
        console.error("Winner email failed:", emailErr);
      }
    }
    return result;
  } catch (err) {
    if (err instanceof Error && err.message === "No eligible entries in pool") {
      return null;
    }
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) {
      return jsonResponse({ error: "Missing Supabase service env variables" }, 500);
    }

    const body = await req.json();
    const action = String(body?.action || "");
    const raffleId = String(body?.raffleId || "");

    if (!raffleId) {
      return jsonResponse({ error: "Missing raffleId" }, 400);
    }

    const admin = getAdminClient();

    if (action === "draw") {
      const user = await getUserFromRequest(req);
      if (!user) {
        return jsonResponse({ error: "Unauthorized: no session" }, 401);
      }
      if (!canManualDraw(user)) {
        return jsonResponse({ error: "Unauthorized: admin role required" }, 403);
      }

      const orgDenied = await assertOrgAdminCanDrawRaffle(admin, user, raffleId);
      if (orgDenied) return orgDenied;

      const result = await executeRaffleDraw(admin, raffleId, user.id);

      if (result.alreadyDrawn) {
        return jsonResponse(
          { error: "Winner already drawn for this raffle" },
          409,
        );
      }

      try {
        await sendWinnerEmail(
          result.winnerTicket.buyerEmail,
          result.winnerTicket.id,
          raffleId,
        );
      } catch (emailErr) {
        console.error("Winner email failed:", emailErr);
      }

      return jsonResponse({
        winnerTicket: result.winnerTicket,
        totalEntries: result.totalEntries,
        randomValue: result.randomValue,
        rngMethod: result.rngMethod,
      });
    }

    if (action === "auto-draw") {
      const result = await autoDrawRaffleIfDue(admin, raffleId);

      if (!result) {
        return jsonResponse({ drawn: false });
      }

      return jsonResponse({
        drawn: !result.alreadyDrawn,
        alreadyDrawn: result.alreadyDrawn,
        winnerTicket: result.winnerTicket,
        totalEntries: result.totalEntries,
        randomValue: result.randomValue,
        rngMethod: result.rngMethod,
      });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Draw failed";
    console.error("raffle-draw error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
