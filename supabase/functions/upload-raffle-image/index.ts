// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Uploads raffle background / gallery images with the service role
// (same layout as the Next.js uploadRaffleImage server action).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isOrgAdmin, isSuperAdmin } from "../_shared/drawAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STORAGE_BUCKET = Deno.env.get("STORAGE_BUCKET") || "chaffle-primary";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeBase64(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const raffleId = body?.raffleId as string | undefined;
    const isBackground = body?.isBackground !== false;
    const contentType = (body?.contentType as string | undefined) || "image/jpeg";
    const fileNameRaw = (body?.fileName as string | undefined) || `${Date.now()}.jpg`;
    const base64 = body?.base64 as string | undefined;

    if (!raffleId || !base64) {
      return jsonResponse({ error: "raffleId and base64 are required" }, 400);
    }
    if (!ALLOWED_MIME.has(contentType)) {
      return jsonResponse({ error: `Unsupported image type (${contentType})` }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: raffle, error: raffleError } = await adminClient
      .from("donation_form")
      .select("id, organization_id")
      .eq("id", raffleId)
      .maybeSingle();

    if (raffleError || !raffle) {
      return jsonResponse({ error: "Raffle not found" }, 404);
    }

    const allowed =
      isSuperAdmin(user) ||
      (isOrgAdmin(user) &&
        raffle.organization_id &&
        raffle.organization_id ===
          ((user.user_metadata?.organization_id as string | undefined) ??
            (user.app_metadata?.organization_id as string | undefined)));

    if (!allowed) {
      return jsonResponse({ error: "Not authorized to upload for this raffle" }, 403);
    }

    const bytes = decodeBase64(base64);
    if (bytes.byteLength === 0) {
      return jsonResponse({ error: "Failed to read image file" }, 400);
    }
    if (bytes.byteLength > MAX_BYTES) {
      return jsonResponse({ error: "Image must be under 2 MB" }, 400);
    }

    const safeName = fileNameRaw.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `public/${raffleId}/${
      isBackground ? "background" : "images"
    }/${safeName}`;

    const { error: uploadError } = await adminClient.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, bytes, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return jsonResponse({ error: uploadError.message }, 500);
    }

    // Same path shape web stores on donation_form.backgroundImage
    return jsonResponse({ path: `/${filePath}` });
  } catch (err) {
    return jsonResponse(
      { error: err?.message || "Upload failed" },
      500,
    );
  }
});
