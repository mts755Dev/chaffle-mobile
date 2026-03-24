import apiClient from './client';
import { supabase } from '../supabase/client';
import {
  DonationForm,
  Ticket,
  TicketTotalByRaffle,
  CreateTicketPayload,
  UpdateFormPayload,
  ContactFormData,
} from '../../types';

/**
 * Raffle / Donation Form APIs
 * These call the Next.js backend API routes which in turn use Prisma
 */

// For direct Supabase queries (read operations that don't need server actions)
// We can use Supabase client directly for reads since the data is in Supabase/Postgres

export const raffleApi = {
  // Get all donation forms (admin)
  getDonationForms: async (): Promise<DonationForm[]> => {
    const { data, error } = await supabase
      .from('donation_form')
      .select('*, ticket(count)');
    if (error) throw error;
    return (data || []).map((d: any) => ({
      ...d,
      _count: { tickets: d.ticket?.[0]?.count || 0 },
    }));
  },

  // Get a single donation form by ID
  getDonationFormById: async (id: string): Promise<DonationForm | null> => {
    const { data, error } = await supabase
      .from('donation_form')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  // Get ticket totals by raffle (sum of paid tickets)
  getTicketsAmountByRaffle: async (raffleId?: string): Promise<TicketTotalByRaffle[]> => {
    let query = supabase
      .from('ticket')
      .select('donation_formId, amount, quantity')
      .eq('paid', true);

    if (raffleId) {
      query = query.eq('donation_formId', raffleId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Group by donation_formId manually
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

  // Create donation form (admin)
  createDonationForm: async (): Promise<DonationForm> => {
    const { data, error } = await supabase
      .from('donation_form')
      .insert({})
      .select()
      .single();
    if (error) throw error;
    return data;
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

  // Get completed raffle IDs (those with winners)
  getCompletedRaffleIds: async (): Promise<string[]> => {
    const { data, error } = await supabase
      .from('ticket')
      .select('donation_formId')
      .eq('isWinner', true);
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

  // Get paid tickets (admin)
  getPaidTickets: async (): Promise<Ticket[]> => {
    const { data, error } = await supabase
      .from('ticket')
      .select('*, donation_form(title)')
      .eq('paid', true);
    if (error) throw error;
    return data || [];
  },

  // Get winner tickets (admin)
  getWinnerTickets: async (): Promise<Ticket[]> => {
    const { data, error } = await supabase
      .from('ticket')
      .select('*, donation_form(title, id)')
      .eq('isWinner', true);
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
