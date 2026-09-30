import apiClient from './client';
import { supabase, supabasePublic } from '../supabase/client';
import { organizationApi } from './organizationApi';
import {
  DonationForm,
  StripeAccount,
  Ticket,
  TicketTotalByRaffle,
  CreateTicketPayload,
  UpdateFormPayload,
  ContactFormData,
  OrgApprovalStatus,
} from '../../types';

/**
 * Raffle / Donation Form APIs — PostgREST via authenticated Supabase client.
 * Public catalogue uses supabasePublic with display columns only (migration 017).
 * Ticket PII is never read via anon — use authenticated client or totals RPC.
 */

/** Columns anon may SELECT on donation_form (017 column grants). No stripeAccount. */
const PUBLIC_DONATION_FORM_COLUMNS = [
  'id',
  'title',
  'mission_statement',
  'charity_info',
  'donation_amount_information',
  'rules',
  'backgroundImage',
  'images',
  'created_at',
  'updated_at',
  'draw_date',
  'min_ticket_price',
  'raffleLocation',
  'autoCheckDonation',
  'locationCheckEnabled',
  'winnerTicketId',
  'drawCompletedAt',
  'custom_domain',
  'presented_by_name',
  'presented_by_image',
  'mobile_title',
  'organization_id',
].join(',');

async function fetchPublicStripeAccountId(
  raffleId: string,
): Promise<StripeAccount | null> {
  const { data, error } = await supabasePublic.rpc(
    'raffle_public_stripe_account_id',
    { p_raffle_id: raffleId },
  );
  if (error || !data || typeof data !== 'string') return null;
  return { id: data };
}

async function fetchOwnedOrganizationIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('organization')
    .select('id')
    .eq('owner_id', userId);
  if (error || !data) return [];
  return data.map((row) => row.id as string).filter(Boolean);
}

export { fetchOwnedOrganizationIds };

/**
 * Org-admin catalogue scope: every organization this user owns.
 * Metadata organization_id alone is not enough — login recovery used to mint a
 * fresh empty org while raffles stayed on the older owned org (0-row dashboard).
 */
async function resolveOrgAdminScopeIds(
  preferredOrgId?: string | null,
): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Never trust metadata organization_id alone — ownership must come from DB.
  if (!user) return [];

  const ownedIds = await fetchOwnedOrganizationIds(user.id);
  if (ownedIds.length === 0) return [];

  if (preferredOrgId && !ownedIds.includes(preferredOrgId)) {
    console.warn('[raffleApi] metadata organization_id not in owned orgs', {
      preferredOrgId,
      ownedIds,
    });
  }

  return ownedIds;
}

export function getEffectiveStripeAccount(
  form: DonationForm,
  orgStripeJson: StripeAccount | null | undefined,
): StripeAccount | null {
  if (form.stripeAccount?.id) return form.stripeAccount;
  if (orgStripeJson?.id) return orgStripeJson;
  return null;
}

async function fetchOrgStripeJson(organizationId: string): Promise<StripeAccount | null> {
  const { data } = await supabase
    .from('organization')
    .select('stripe_account_json')
    .eq('id', organizationId)
    .single();
  return (data?.stripe_account_json as StripeAccount) ?? null;
}

async function fetchOrgDetails(
  organizationIds: string[],
): Promise<Record<string, { name: string; approval_status: OrgApprovalStatus }>> {
  if (organizationIds.length === 0) return {};

  const { data } = await supabase
    .from('organization')
    .select('id, name, approval_status')
    .in('id', organizationIds);

  const map: Record<string, { name: string; approval_status: OrgApprovalStatus }> = {};
  for (const org of data ?? []) {
    map[org.id] = {
      name: org.name,
      approval_status: (org.approval_status as OrgApprovalStatus) ?? 'pending',
    };
  }

  const missingIds = organizationIds.filter((id) => !map[id]);
  if (missingIds.length === 0) return map;

  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`org lookup timed out after ${ms}ms`)), ms),
      ),
    ]);

  try {
    const orgs = await withTimeout(
      organizationApi.getOrganizationsByIds(missingIds),
      4000,
    );
    for (const org of orgs) {
      map[org.id] = {
        name: org.name,
        approval_status: (org.approval_status as OrgApprovalStatus) ?? 'pending',
      };
    }
  } catch (err: any) {
    console.warn('[fetchOrgDetails] edge list-by-ids failed', err?.message);
  }

  return map;
}

async function enrichDonationForms(forms: DonationForm[]): Promise<DonationForm[]> {
  if (forms.length === 0) return forms;
  try {
    const orgIds = [...new Set(forms.map((f) => f.organization_id).filter(Boolean))] as string[];
    const orgStripeMap: Record<string, StripeAccount | null> = {};
    const orgDetailMap = await fetchOrgDetails(orgIds);
    await Promise.all(
      orgIds.map(async (oid) => {
        orgStripeMap[oid] = await fetchOrgStripeJson(oid);
      }),
    );

    return forms.map((f) => {
      const orgDetail = f.organization_id ? orgDetailMap[f.organization_id] : undefined;
      return {
        ...f,
        organization_name: orgDetail?.name ?? null,
        organization_approval_status: orgDetail?.approval_status ?? null,
        stripeAccount: getEffectiveStripeAccount(
          f,
          f.organization_id ? orgStripeMap[f.organization_id] : null,
        ),
      };
    });
  } catch (enrichErr: any) {
    console.warn('[raffleApi.enrichDonationForms] skipped', enrichErr?.message);
    return forms;
  }
}

export const raffleApi = {
  getDonationForms: async (organizationId?: string | null): Promise<DonationForm[]> => {
    // Public catalogue — display columns only (anon cannot select stripeAccount).
    let query = supabasePublic
      .from('donation_form')
      .select(PUBLIC_DONATION_FORM_COLUMNS)
      .order('created_at', { ascending: false });

    if (organizationId) {
      const scopeIds = await resolveOrgAdminScopeIds(organizationId);
      if (scopeIds.length === 0) {
        console.log('[raffleApi.getDonationForms] public rows= 0', {
          organizationId,
          scopeIds,
        });
        return [];
      }
      query = query.in('organization_id', scopeIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const forms: DonationForm[] = (data || []).map((d: any) => ({
      ...d,
      _count: { tickets: 0 },
    }));

    console.log('[raffleApi.getDonationForms] public rows=', forms.length, {
      organizationId: organizationId ?? null,
      scoped: !!organizationId,
    });

    return enrichDonationForms(forms);
  },

  getDonationFormById: async (id: string): Promise<DonationForm | null> => {
    // Same public catalogue path as list — Preview / Home / Worker / FreeTicket.
    const { data, error } = await supabasePublic
      .from('donation_form')
      .select(PUBLIC_DONATION_FORM_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('[raffleApi.getDonationFormById]', error.message, { id });
      return null;
    }
    if (!data) return null;

    const form = data as DonationForm;
    if (form.organization_id) {
      const orgDetailMap = await fetchOrgDetails([form.organization_id]);
      const orgDetail = orgDetailMap[form.organization_id];
      form.organization_name = orgDetail?.name ?? null;
      form.organization_approval_status = orgDetail?.approval_status ?? null;

      if (!form.stripeAccount?.id) {
        const orgStripe = await fetchOrgStripeJson(form.organization_id);
        form.stripeAccount = getEffectiveStripeAccount(form, orgStripe);
      }
    }
    if (!form.stripeAccount?.id) {
      form.stripeAccount = (await fetchPublicStripeAccountId(id)) ?? undefined;
    }
    return form;
  },

  getTicketsAmountByRaffle: async (
    raffleId?: string,
    raffleIds?: string[],
  ): Promise<TicketTotalByRaffle[]> => {
    // Aggregates only — never list ticket rows via anon (017).
    if (raffleId) {
      const { data, error } = await supabasePublic.rpc('raffle_public_totals', {
        p_raffle_id: raffleId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return [{ donation_formId: raffleId, _sum: { quantity: 0, amount: 0 } }];
      }
      return [
        {
          donation_formId: raffleId,
          _sum: {
            quantity: Number(row.entry_sum ?? 0),
            amount: Number(row.amount_sum ?? 0),
          },
        },
      ];
    }

    if (raffleIds && raffleIds.length > 0) {
      const { data, error } = await supabasePublic.rpc(
        'raffle_public_totals_for_ids',
        { p_raffle_ids: raffleIds },
      );
      if (error) throw error;
      const rows = (data || []) as Array<{
        donation_form_id: string;
        entry_sum: number;
        amount_sum: number;
      }>;
      const byId = new Map(
        rows.map((r) => [
          r.donation_form_id,
          {
            donation_formId: r.donation_form_id,
            _sum: {
              quantity: Number(r.entry_sum ?? 0),
              amount: Number(r.amount_sum ?? 0),
            },
          },
        ]),
      );
      return raffleIds.map(
        (id) =>
          byId.get(id) ?? {
            donation_formId: id,
            _sum: { quantity: 0, amount: 0 },
          },
      );
    }

    // Unscoped (super-admin all raffles): public aggregate RPC — works even when
    // JWT lacks app_metadata yet / ticket row SELECT is restricted.
    const { data: forms, error: formsError } = await supabasePublic
      .from('donation_form')
      .select('id');
    if (formsError) throw formsError;
    const allIds = (forms || []).map((f: { id: string }) => f.id);
    if (allIds.length === 0) return [];

    const byId = new Map<
      string,
      { donation_formId: string; _sum: { quantity: number; amount: number } }
    >();
    const chunkSize = 200;
    for (let i = 0; i < allIds.length; i += chunkSize) {
      const chunk = allIds.slice(i, i + chunkSize);
      const { data, error } = await supabasePublic.rpc(
        'raffle_public_totals_for_ids',
        { p_raffle_ids: chunk },
      );
      if (error) throw error;
      for (const r of (data || []) as Array<{
        donation_form_id: string;
        entry_sum: number;
        amount_sum: number;
      }>) {
        byId.set(r.donation_form_id, {
          donation_formId: r.donation_form_id,
          _sum: {
            quantity: Number(r.entry_sum ?? 0),
            amount: Number(r.amount_sum ?? 0),
          },
        });
      }
    }

    return allIds.map(
      (id) =>
        byId.get(id) ?? {
          donation_formId: id,
          _sum: { quantity: 0, amount: 0 },
        },
    );
  },

  createDonationForm: async (
    organizationId?: string | null,
    data?: Omit<UpdateFormPayload, 'id'>,
  ): Promise<DonationForm> => {
    if (organizationId) {
      const { data: org, error: orgError } = await supabase
        .from('organization')
        .select('approval_status, stripe_account_json, stripe_account_id')
        .eq('id', organizationId)
        .single();

      if (orgError) throw orgError;
      if (org?.approval_status !== 'approved') {
        throw new Error(
          'Your organization must be approved before you can create raffles.',
        );
      }

      const insertPayload: Record<string, unknown> = { ...(data ?? {}) };
      insertPayload.organization_id = organizationId;
      if (org.stripe_account_json && typeof org.stripe_account_json === 'object') {
        insertPayload.stripeAccount = org.stripe_account_json;
      } else if (org.stripe_account_id) {
        insertPayload.stripeAccount = { id: org.stripe_account_id };
      }

      const { data: created, error } = await supabase
        .from('donation_form')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return created;
    }

    const insertPayload: Record<string, unknown> = { ...(data ?? {}) };
    const { data: created, error } = await supabase
      .from('donation_form')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return created;
  },

  updateForm: async (payload: UpdateFormPayload): Promise<DonationForm> => {
    const { id, ...updateData } = payload;
    const { data, error } = await supabase
      .from('donation_form')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deleteDonation: async (id: string): Promise<void> => {
    await supabase.from('secure_link').delete().eq('raffleId', id);
    await supabase.from('ticket').delete().eq('donation_formId', id);
    const { error } = await supabase.from('donation_form').delete().eq('id', id);
    if (error) throw error;
  },

  getCompletedRaffleIds: async (raffleIds?: string[]): Promise<string[]> => {
    // winnerTicketId is a public display column — no ticket table dump.
    let query = supabasePublic
      .from('donation_form')
      .select('id')
      .not('winnerTicketId', 'is', null);

    if (raffleIds && raffleIds.length > 0) {
      query = query.in('id', raffleIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((d: { id: string }) => d.id);
  },
};

export const ticketApi = {
  createTicket: async (payload: CreateTicketPayload): Promise<Ticket> => {
    // Root cause of "new row violates RLS for ticket" (verified against live DB):
    // buyer INSERT policy rejects when donation_formId is missing/unknown, the
    // raffle already has a winner, or paid/isWinner are true. Policies themselves
    // are fine — anon insert of an unpaid ticket on an open raffle succeeds.
    //
    // Stay under RLS: no service_role / SECURITY DEFINER insert.
    const raffleId = String(payload.raffleId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(raffleId)) {
      throw new Error('Missing or invalid raffle id — cannot create ticket.');
    }

    const amount = Math.round(Number(payload.amount));
    const quantity = Math.round(Number(payload.quantity));
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(quantity) || quantity < 1) {
      throw new Error('Invalid ticket amount or quantity.');
    }

    const { data: isOpen, error: openErr } = await supabasePublic.rpc(
      'raffle_is_open_for_purchase',
      { p_raffle_id: raffleId },
    );
    if (openErr) {
      throw new Error(
        `Could not verify raffle is open: ${openErr.message}. Re-run migration 022 if this function is missing.`,
      );
    }
    if (!isOpen) {
      throw new Error(
        'This raffle is closed (a winner was already drawn). Buyer checkout is blocked by RLS until you use a raffle with no winner.',
      );
    }

    const id =
      globalThis.crypto?.randomUUID?.() ??
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
        const n = (Math.random() * 16) | 0;
        const v = ch === 'x' ? n : (n & 0x3) | 0x8;
        return v.toString(16);
      });

    const row = {
      id,
      buyerName: payload.name,
      buyerEmail: payload.email,
      phone: payload.phone || null,
      address: payload.address || null,
      amount,
      quantity,
      donation_formId: raffleId,
      ip: payload.ip || '0.0.0.0',
      isFree: !!payload.isFree,
      paid: false,
      isWinner: false,
    };

    // 1) Buyer path (anon) — no JWT. No RETURNING (anon has no ticket SELECT).
    const anonInsert = await supabasePublic.from('ticket').insert(row);
    if (!anonInsert.error) {
      return { ...row, stripeSession: null, created_at: '', updated_at: '' } as Ticket;
    }

    // 2) Staff path (authenticated) — still RLS: "Managers can insert…" /
    //    "Buyers can insert unpaid…". Used when public client misbehaves.
    const authInsert = await supabase.from('ticket').insert(row);
    if (!authInsert.error) {
      return { ...row, stripeSession: null, created_at: '', updated_at: '' } as Ticket;
    }

    const detail = authInsert.error.message || anonInsert.error.message;
    if (/row-level security/i.test(detail)) {
      throw new Error(
        `Ticket insert blocked by RLS (raffle ${raffleId}). ` +
          `Usually: raffle closed, wrong raffle id, or session missing buyer/manager insert rights. ` +
          `DB detail: ${detail}`,
      );
    }
    throw new Error(detail);
  },

  updateTicket: async (id: string, updates: Partial<Ticket>): Promise<Ticket> => {
    // Prefer auth (managers); fall back to public checkout window for buyers.
    const { data, error } = await supabase
      .from('ticket')
      .update(updates)
      .eq('id', id)
      .select('id, donation_formId, paid, quantity, amount, created_at, isFree, isWinner')
      .maybeSingle();
    if (!error && data) return data as Ticket;

    const { data: pub, error: pubErr } = await supabasePublic
      .from('ticket')
      .update(updates)
      .eq('id', id)
      .select('id, donation_formId, paid, quantity, amount, created_at, isFree, isWinner')
      .single();
    if (pubErr) throw pubErr;
    return pub as Ticket;
  },

  getTicketById: async (id: string): Promise<Ticket | null> => {
    // Ticket PII requires authenticated manager / checkout session (017: no anon SELECT).
    const { data, error } = await supabase
      .from('ticket')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return null;
    return data;
  },

  getTicketWhere: async (where: Partial<Ticket>): Promise<Ticket | null> => {
    let authQuery = supabase.from('ticket').select('*');
    Object.entries(where).forEach(([key, value]) => {
      if (value !== undefined) authQuery = authQuery.eq(key, value);
    });
    const { data } = await authQuery.limit(1).maybeSingle();
    return data;
  },

  getTicketsWhere: async (where: Partial<Ticket>): Promise<Ticket[]> => {
    let authQuery = supabase.from('ticket').select('*');
    Object.entries(where).forEach(([key, value]) => {
      if (value !== undefined) authQuery = authQuery.eq(key, value);
    });
    const { data, error } = await authQuery;
    if (error) throw error;
    return data || [];
  },

  getPaidTickets: async (raffleIds?: string[]): Promise<Ticket[]> => {
    if (raffleIds !== undefined && raffleIds.length === 0) {
      return [];
    }

    // Buyer PII — authenticated only (017 blocks anon scrapes).
    const pageSize = 1000;
    const all: Ticket[] = [];
    let from = 0;

    for (;;) {
      let query = supabase
        .from('ticket')
        .select('*, donation_form(title)')
        .eq('paid', true)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (raffleIds !== undefined) {
        query = query.in('donation_formId', raffleIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as Ticket[];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return all;
  },

  getWinnerTickets: async (raffleIds?: string[]): Promise<Ticket[]> => {
    if (raffleIds !== undefined && raffleIds.length === 0) {
      return [];
    }

    const pageSize = 1000;
    const all: Ticket[] = [];
    let from = 0;

    for (;;) {
      let query = supabase
        .from('ticket')
        .select('*, donation_form(title, id)')
        .eq('isWinner', true)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (raffleIds !== undefined) {
        query = query.in('donation_formId', raffleIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as Ticket[];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return all;
  },

  hasRaffleWinner: async (raffleId: string): Promise<boolean> => {
    const { data } = await supabasePublic
      .from('donation_form')
      .select('winnerTicketId')
      .eq('id', raffleId)
      .maybeSingle();
    return !!data?.winnerTicketId;
  },
};

export const secureLinkApi = {
  createUniqueRecord: async (raffleId: string): Promise<any> => {
    await supabase.from('secure_link').delete().eq('raffleId', raffleId);
    const { data, error } = await supabase
      .from('secure_link')
      .insert({ raffleId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  getDonationFormBySecureLink: async (secureLinkId: string): Promise<DonationForm | null> => {
    // secure_link itself is manager-only; raffle row is public catalogue.
    const { data, error } = await supabase
      .from('secure_link')
      .select('raffleId')
      .eq('id', secureLinkId)
      .maybeSingle();
    if (error || !data?.raffleId) return null;
    return raffleApi.getDonationFormById(data.raffleId);
  },
};

export const contactApi = {
  sendContactEmail: async (formData: ContactFormData): Promise<{ success: boolean }> => {
    try {
      await apiClient.post('/api/contact', formData);
      return { success: true };
    } catch {
      throw new Error('Contact API not available');
    }
  },
};
