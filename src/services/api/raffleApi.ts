import apiClient from './client';
import { supabase } from '../supabase/client';
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
 * Raffle / Donation Form APIs
 * These call the Next.js backend API routes which in turn use Prisma
 */

// For direct Supabase queries (read operations that don't need server actions)
// We can use Supabase client directly for reads since the data is in Supabase/Postgres

/**
 * Returns the effective Stripe account for a form.
 * Prefers the raffle's own stripeAccount; falls back to the org-level one.
 */
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
  if (missingIds.length > 0) {
    try {
      const orgs = await organizationApi.getOrganizationsByIds(missingIds);
      for (const org of orgs) {
        map[org.id] = {
          name: org.name,
          approval_status: (org.approval_status as OrgApprovalStatus) ?? 'pending',
        };
      }
    } catch {
      try {
        const allOrgs = await organizationApi.listOrganizations('all');
        for (const org of allOrgs) {
          if (missingIds.includes(org.id)) {
            map[org.id] = {
              name: org.name,
              approval_status: (org.approval_status as OrgApprovalStatus) ?? 'pending',
            };
          }
        }
      } catch {
        // Super-admin edge function may be unavailable.
      }
    }
  }

  return map;
}

export const raffleApi = {
  // Get all donation forms (admin) — optionally filtered by organization
  getDonationForms: async (organizationId?: string | null): Promise<DonationForm[]> => {
    let query = supabase
      .from('donation_form')
      .select('*, ticket(count)');

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const forms: DonationForm[] = (data || []).map((d: any) => ({
      ...d,
      _count: { tickets: d.ticket?.[0]?.count || 0 },
    }));

    // Org-level stripe inheritance: fetch once per unique org
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
  },

  // Get a single donation form by ID
  getDonationFormById: async (id: string): Promise<DonationForm | null> => {
    const { data, error } = await supabase
      .from('donation_form')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;

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
    return form;
  },

  // Get ticket totals by raffle (sum of paid tickets)
  getTicketsAmountByRaffle: async (raffleId?: string, raffleIds?: string[]): Promise<TicketTotalByRaffle[]> => {
    let query = supabase
      .from('ticket')
      .select('donation_formId, amount, quantity')
      .eq('paid', true);

    if (raffleId) {
      query = query.eq('donation_formId', raffleId);
    } else if (raffleIds && raffleIds.length > 0) {
      query = query.in('donation_formId', raffleIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const grouped: Record<string, { quantity: number; amount: number }> = {};
    (data || []).forEach((t: any) => {
      const key = t.donation_formId;
      if (!grouped[key]) grouped[key] = { quantity: 0, amount: 0 };
      grouped[key].quantity += t.quantity;
      grouped[key].amount += t.amount;
    });

    return Object.entries(grouped).map(([id, sums]) => ({
      donation_formId: id,
      _sum: sums,
    }));
  },

  // Create donation form (admin) — org admins pass their organization_id
  createDonationForm: async (
    organizationId?: string | null,
    data?: Omit<UpdateFormPayload, 'id'>,
  ): Promise<DonationForm> => {
    if (organizationId) {
      const { data: org, error: orgError } = await supabase
        .from('organization')
        .select('approval_status')
        .eq('id', organizationId)
        .single();

      if (orgError) throw orgError;
      if (org?.approval_status !== 'approved') {
        throw new Error(
          'Your organization must be approved before you can create raffles.',
        );
      }
    }

    const insertPayload: Record<string, unknown> = { ...(data ?? {}) };
    if (organizationId) {
      insertPayload.organization_id = organizationId;
    }
    const { data: created, error } = await supabase
      .from('donation_form')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return created;
  },

  // Update donation form (admin)
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

  // Delete donation form (admin)
  deleteDonation: async (id: string): Promise<void> => {
    // Delete related records first
    await supabase.from('secure_link').delete().eq('raffleId', id);
    await supabase.from('ticket').delete().eq('donation_formId', id);
    const { error } = await supabase.from('donation_form').delete().eq('id', id);
    if (error) throw error;
  },

  // Get completed raffle IDs (those with winners) — optionally scoped to raffleIds
  getCompletedRaffleIds: async (raffleIds?: string[]): Promise<string[]> => {
    let query = supabase
      .from('ticket')
      .select('donation_formId')
      .eq('isWinner', true);

    if (raffleIds && raffleIds.length > 0) {
      query = query.in('donation_formId', raffleIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return [...new Set((data || []).map((d: any) => d.donation_formId).filter(Boolean))];
  },
};

export const ticketApi = {
  // Create a ticket
  createTicket: async (payload: CreateTicketPayload): Promise<Ticket> => {
    const { data, error } = await supabase
      .from('ticket')
      .insert({
        buyerName: payload.name,
        buyerEmail: payload.email,
        phone: payload.phone,
        address: payload.address,
        amount: payload.amount,
        quantity: payload.quantity,
        donation_formId: payload.raffleId,
        ip: payload.ip,
        isFree: payload.isFree || false,
        paid: payload.paid || false,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Update a ticket
  updateTicket: async (id: string, updates: Partial<Ticket>): Promise<Ticket> => {
    const { data, error } = await supabase
      .from('ticket')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Get a ticket by ID
  getTicketById: async (id: string): Promise<Ticket | null> => {
    const { data, error } = await supabase
      .from('ticket')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  // Find ticket by criteria
  getTicketWhere: async (where: Partial<Ticket>): Promise<Ticket | null> => {
    let query = supabase.from('ticket').select('*');
    Object.entries(where).forEach(([key, value]) => {
      if (value !== undefined) query = query.eq(key, value);
    });
    const { data } = await query.limit(1).single();
    return data;
  },

  // Get all tickets matching criteria
  getTicketsWhere: async (where: Partial<Ticket>): Promise<Ticket[]> => {
    let query = supabase.from('ticket').select('*');
    Object.entries(where).forEach(([key, value]) => {
      if (value !== undefined) query = query.eq(key, value);
    });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Get paid tickets (admin) — optionally scoped to specific raffle IDs
  getPaidTickets: async (raffleIds?: string[]): Promise<Ticket[]> => {
    let query = supabase
      .from('ticket')
      .select('*, donation_form(title)')
      .eq('paid', true);

    if (raffleIds && raffleIds.length > 0) {
      query = query.in('donation_formId', raffleIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Get winner tickets (admin) — optionally scoped to specific raffle IDs
  getWinnerTickets: async (raffleIds?: string[]): Promise<Ticket[]> => {
    let query = supabase
      .from('ticket')
      .select('*, donation_form(title, id)')
      .eq('isWinner', true);

    if (raffleIds && raffleIds.length > 0) {
      query = query.in('donation_formId', raffleIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Check if raffle has a winner
  hasRaffleWinner: async (raffleId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('ticket')
      .select('id')
      .eq('donation_formId', raffleId)
      .eq('isWinner', true)
      .limit(1)
      .single();
    return !!data;
  },
};

export const secureLinkApi = {
  // Create unique secure link record
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

  // Get donation form by secure link
  getDonationFormBySecureLink: async (secureLinkId: string): Promise<DonationForm | null> => {
    const { data, error } = await supabase
      .from('secure_link')
      .select('*, donation_form:raffle(*)')
      .eq('id', secureLinkId)
      .single();
    if (error) return null;
    return data?.donation_form || null;
  },
};

export const contactApi = {
  // Send contact/support email through the backend
  sendContactEmail: async (formData: ContactFormData): Promise<{ success: boolean }> => {
    try {
      const response = await apiClient.post('/api/contact', formData);
      return { success: true };
    } catch {
      // Fallback: send directly via API
      // The web app uses server actions for email, so we need an API route
      // For now, return success (you may need to add an /api/contact route to the web backend)
      throw new Error('Contact API not available');
    }
  },
};
