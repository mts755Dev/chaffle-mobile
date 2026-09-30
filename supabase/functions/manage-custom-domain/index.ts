// @ts-nocheck — Runs in Supabase's Deno runtime, not in the React Native bundle.
//
// Custom domain add/remove/status — mirrors web setCustomDomain / getCustomDomainStatus
// (Vercel project domains + donation_form.custom_domain).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSuperAdmin } from "../_shared/drawAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type DnsRecord = {
  type: string;
  name: string;
  value: string;
  note?: string;
};

type CustomDomainStatus = {
  domain: string;
  isLive: boolean;
  status: "live" | "pending_dns" | "pending_verification";
  statusLabel: string;
  statusDescription: string;
  records: DnsRecord[];
  configuredBy: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeDomain(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .trim();
}

function vercelHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function teamQuery(teamId: string | undefined): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function addDomainToVercel(
  domain: string,
  token: string,
  projectId: string,
  teamId?: string,
) {
  const url =
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains` +
    teamQuery(teamId);
  const res = await fetch(url, {
    method: "POST",
    headers: vercelHeaders(token),
    body: JSON.stringify({ name: domain }),
  });
  if (res.ok) return { success: true as const };
  const text = await res.text();
  if (text.toLowerCase().includes("already exists")) {
    return { success: true as const };
  }
  let message = text;
  try {
    message = JSON.parse(text)?.error?.message || text;
  } catch {
    // keep text
  }
  return { success: false as const, error: message || "Failed to add domain" };
}

async function removeDomainFromVercel(
  domain: string,
  token: string,
  projectId: string,
  teamId?: string,
) {
  const url =
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}` +
    teamQuery(teamId);
  const res = await fetch(url, {
    method: "DELETE",
    headers: vercelHeaders(token),
  });
  if (res.ok || res.status === 404) return { success: true as const };
  const text = await res.text();
  return { success: false as const, error: text || "Failed to remove domain" };
}

async function verifyDomain(
  domain: string,
  token: string,
  projectId: string,
  teamId?: string,
) {
  const url =
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify` +
    teamQuery(teamId);
  await fetch(url, { method: "POST", headers: vercelHeaders(token) });
}

async function getDomainConfig(
  domain: string,
  token: string,
  projectId: string,
  teamId?: string,
) {
  const params = new URLSearchParams({ projectIdOrName: projectId });
  if (teamId) params.set("teamId", teamId);
  const url = `https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config?${params}`;
  const res = await fetch(url, { headers: vercelHeaders(token) });
  if (!res.ok) {
    return { success: false as const, error: await res.text() };
  }
  return { success: true as const, data: await res.json() };
}

async function getProjectDomainInfo(
  domain: string,
  token: string,
  projectId: string,
  teamId?: string,
) {
  const url =
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}` +
    teamQuery(teamId);
  const res = await fetch(url, { headers: vercelHeaders(token) });
  if (!res.ok) return { success: false as const, data: null };
  return { success: true as const, data: await res.json() };
}

function dnsRecordName(domain: string, apexName: string): string {
  if (domain === apexName) return "@";
  const suffix = `.${apexName}`;
  if (domain.endsWith(suffix)) return domain.slice(0, -suffix.length);
  return domain.split(".")[0] ?? "@";
}

function buildDnsRecords(
  domain: string,
  config: any,
  projectDomain: any,
): DnsRecord[] {
  const records: DnsRecord[] = [];
  const apexName = projectDomain?.apexName ?? domain;
  const isApex = domain === apexName;
  const name = dnsRecordName(domain, apexName);

  const ipv4 = [...(config.recommendedIPv4 || [])].sort(
    (a: any, b: any) => a.rank - b.rank,
  )[0];
  const cname = [...(config.recommendedCNAME || [])].sort(
    (a: any, b: any) => a.rank - b.rank,
  )[0];

  if (isApex && ipv4?.value?.length) {
    const ips = ipv4.value;
    const alternateIps = ips.slice(1);
    records.push({
      type: "A",
      name: "@",
      value: ips[0],
      note:
        alternateIps.length > 0
          ? `Root domain — add at your registrar. Also add @ → ${alternateIps.join(", @ → ")} if allowed`
          : "Root domain — add at your registrar",
    });
  }

  if (!isApex && cname?.value) {
    records.push({
      type: "CNAME",
      name,
      value: cname.value,
      note: "Subdomain — add at your registrar",
    });
  }

  if (isApex && cname?.value) {
    records.push({
      type: "CNAME",
      name: "www",
      value: cname.value,
      note: "Optional — so www.yourdomain.com works",
    });
  }

  if (projectDomain?.verification?.length) {
    for (const v of projectDomain.verification) {
      if (v.type === "TXT") {
        const txtName =
          v.domain === apexName ? "@" : dnsRecordName(v.domain, apexName);
        records.push({
          type: "TXT",
          name: txtName,
          value: v.value,
          note: v.reason || "Domain ownership verification",
        });
      }
    }
  }

  return records;
}

function resolveCustomDomainStatus(
  domain: string,
  config: any,
  projectDomain: any,
): CustomDomainStatus {
  const dnsOk = !config.misconfigured;
  const verified = projectDomain?.verified ?? false;
  const isLive = dnsOk && verified;

  let status: CustomDomainStatus["status"];
  let statusLabel: string;
  let statusDescription: string;

  if (isLive) {
    status = "live";
    statusLabel = "Live";
    statusDescription =
      "DNS is configured correctly. Your custom domain should load this raffle.";
  } else if (!dnsOk) {
    status = "pending_dns";
    statusLabel = "Not live — DNS required";
    statusDescription =
      "Add the DNS records below at your domain registrar, then tap Refresh status.";
  } else {
    status = "pending_verification";
    statusLabel = "Not live — verification pending";
    statusDescription =
      "DNS looks correct. Complete any TXT verification records below, then tap Refresh status.";
  }

  return {
    domain,
    isLive,
    status,
    statusLabel,
    statusDescription,
    records: buildDnsRecords(domain, config, projectDomain),
    configuredBy: config.configuredBy ?? null,
  };
}

async function fetchCustomDomainStatus(
  domain: string,
  token: string,
  projectId: string,
  teamId?: string,
): Promise<
  | { success: true; data: CustomDomainStatus }
  | { success: false; error: string }
> {
  const cleaned = normalizeDomain(domain);
  if (!cleaned) return { success: false, error: "No domain provided" };

  try {
    await verifyDomain(cleaned, token, projectId, teamId);
  } catch {
    // non-fatal
  }

  const configResult = await getDomainConfig(cleaned, token, projectId, teamId);
  if (!configResult.success || !configResult.data) {
    return {
      success: false,
      error: configResult.error || "Could not load domain DNS configuration",
    };
  }

  const projectResult = await getProjectDomainInfo(
    cleaned,
    token,
    projectId,
    teamId,
  );
  const projectDomain = projectResult.success ? projectResult.data : null;

  return {
    success: true,
    data: resolveCustomDomainStatus(cleaned, configResult.data, projectDomain),
  };
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
    const vercelToken = Deno.env.get("VERCEL_TOKEN");
    const projectId = Deno.env.get("VERCEL_PROJECT_ID");
    const teamId = Deno.env.get("VERCEL_TEAM_ID") || undefined;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user || !isSuperAdmin(user)) {
      return jsonResponse({ error: "Unauthorized: admin role required" }, 403);
    }

    if (!vercelToken || !projectId) {
      return jsonResponse(
        { error: "Vercel API is not configured (VERCEL_TOKEN / VERCEL_PROJECT_ID)." },
        500,
      );
    }

    const body = await req.json();
    const action = body?.action as string | undefined;
    const raffleId = body?.raffleId as string | undefined;
    const domainRaw = body?.domain as string | null | undefined;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (action === "status") {
      const domain = normalizeDomain(String(domainRaw || ""));
      if (!domain) return jsonResponse({ error: "domain is required" }, 400);
      const result = await fetchCustomDomainStatus(
        domain,
        vercelToken,
        projectId,
        teamId,
      );
      if (!result.success) {
        return jsonResponse({ error: result.error }, 400);
      }
      return jsonResponse({ success: true, domainStatus: result.data });
    }

    if (action !== "set") {
      return jsonResponse({ error: "Unknown action" }, 400);
    }

    if (!raffleId) {
      return jsonResponse({ error: "raffleId is required" }, 400);
    }

    const { data: existing, error: fetchError } = await adminClient
      .from("donation_form")
      .select("id, custom_domain")
      .eq("id", raffleId)
      .maybeSingle();

    if (fetchError || !existing) {
      return jsonResponse({ error: "Raffle not found" }, 404);
    }

    const oldDomain = (existing.custom_domain as string | null) ?? null;
    const nextDomain = domainRaw ? normalizeDomain(String(domainRaw)) : null;

    if (oldDomain && oldDomain !== nextDomain) {
      await removeDomainFromVercel(oldDomain, vercelToken, projectId, teamId);
    }

    if (nextDomain) {
      const { data: conflict } = await adminClient
        .from("donation_form")
        .select("id")
        .eq("custom_domain", nextDomain)
        .neq("id", raffleId)
        .maybeSingle();

      if (conflict) {
        return jsonResponse(
          { error: "This domain is already in use by another raffle" },
          400,
        );
      }

      const vercelResult = await addDomainToVercel(
        nextDomain,
        vercelToken,
        projectId,
        teamId,
      );
      if (!vercelResult.success) {
        return jsonResponse(
          { error: vercelResult.error ?? "Failed to add domain" },
          400,
        );
      }

      const { error: updateError } = await adminClient
        .from("donation_form")
        .update({ custom_domain: nextDomain })
        .eq("id", raffleId);

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }

      const statusResult = await fetchCustomDomainStatus(
        nextDomain,
        vercelToken,
        projectId,
        teamId,
      );

      return jsonResponse({
        success: true,
        custom_domain: nextDomain,
        domainStatus: statusResult.success ? statusResult.data : null,
      });
    }

    const { error: clearError } = await adminClient
      .from("donation_form")
      .update({ custom_domain: null })
      .eq("id", raffleId);

    if (clearError) {
      return jsonResponse({ error: clearError.message }, 500);
    }

    return jsonResponse({
      success: true,
      custom_domain: null,
      domainStatus: null,
    });
  } catch (err) {
    return jsonResponse(
      { error: err?.message || "Custom domain request failed" },
      500,
    );
  }
});
