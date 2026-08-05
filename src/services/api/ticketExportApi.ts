/**
 * Ticket CSV export — matches chaffle/serverActions/ticketsExport.ts row shape.
 * Mobile allows super_admin and org_admin (org-scoped).
 */

import { supabase } from '../supabase/client';
import { getTicketReferenceId } from '../../utils';
import type { AdminRole } from '../../types';

export type TicketExportRow = {
  referenceId: string;
  ticketId: string;
  buyerName: string;
  buyerEmail: string;
  phone: string;
  address: string;
  amount: number;
  quantity: number;
  isFree: boolean;
  paid: boolean;
  isWinner: boolean;
  raffleTitle: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketExportResult =
  | {
      success: true;
      raffleTitle: string;
      tickets: TicketExportRow[];
      purchaseCount: number;
      paidPurchaseCount: number;
      paidEntriesSold: number;
      totalEntries: number;
    }
  | { success: false; error: string };

function canExportTickets(role: AdminRole | null): boolean {
  return role === 'super_admin' || role === 'org_admin';
}

/**
 * Fetch all tickets for a raffle for CSV export.
 * Includes paid and unpaid so admins can filter in spreadsheet software.
 */
export async function getRaffleTicketsForExport(params: {
  raffleId: string;
  role: AdminRole | null;
  organizationId?: string | null;
}): Promise<TicketExportResult> {
  try {
    const { raffleId, role, organizationId } = params;

    if (!canExportTickets(role)) {
      return { success: false, error: 'Unauthorized: admin role required' };
    }

    if (!raffleId) {
      return { success: false, error: 'Raffle id is required' };
    }

    const { data: raffle, error: raffleError } = await supabase
      .from('donation_form')
      .select('id, title, organization_id')
      .eq('id', raffleId)
      .maybeSingle();

    if (raffleError) {
      return { success: false, error: raffleError.message };
    }
    if (!raffle) {
      return { success: false, error: 'Raffle not found' };
    }

    if (role === 'org_admin') {
      if (!organizationId || raffle.organization_id !== organizationId) {
        return {
          success: false,
          error: 'You can only export tickets for your organization raffles',
        };
      }
    }

    const { data: tickets, error: ticketsError } = await supabase
      .from('ticket')
      .select(
        'id, buyerName, buyerEmail, phone, address, amount, quantity, isFree, paid, isWinner, created_at, updated_at',
      )
      .eq('donation_formId', raffleId)
      .order('created_at', { ascending: true });

    if (ticketsError) {
      return { success: false, error: ticketsError.message };
    }

    const rows = tickets ?? [];
    const raffleTitle = raffle.title ?? 'Untitled raffle';

    return {
      success: true,
      raffleTitle,
      purchaseCount: rows.length,
      paidPurchaseCount: rows.filter((t) => t.paid).length,
      paidEntriesSold: rows
        .filter((t) => t.paid)
        .reduce((sum, t) => sum + (t.quantity ?? 0), 0),
      totalEntries: rows.reduce((sum, t) => sum + (t.quantity ?? 0), 0),
      tickets: rows.map((t) => ({
        referenceId: getTicketReferenceId(t.id),
        ticketId: t.id,
        buyerName: t.buyerName,
        buyerEmail: t.buyerEmail,
        phone: t.phone ?? '',
        address: t.address ?? '',
        amount: t.amount,
        quantity: t.quantity,
        isFree: !!t.isFree,
        paid: !!t.paid,
        isWinner: !!t.isWinner,
        raffleTitle,
        createdAt: new Date(t.created_at).toISOString(),
        updatedAt: new Date(t.updated_at).toISOString(),
      })),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to export tickets';
    return { success: false, error: message };
  }
}
