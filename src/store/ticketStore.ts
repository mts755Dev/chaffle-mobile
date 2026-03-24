import { create } from 'zustand';
import { Ticket, TicketTotalByRaffle } from '../types';
import { ticketApi, raffleApi } from '../services/api/raffleApi';

export interface EnrichedWinnerTicket extends Ticket {
  paidQuantity?: number;
  totalAmount?: number;
  estimatedAmount?: number;
}

interface TicketState {
  tickets: Ticket[];
  winnerTickets: EnrichedWinnerTicket[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPaidTickets: () => Promise<void>;
  fetchWinnerTickets: () => Promise<void>;
  fetchTicketsByRaffle: (raffleId: string) => Promise<Ticket[]>;
  clearError: () => void;
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  winnerTickets: [],
  isLoading: false,
  error: null,

  fetchPaidTickets: async () => {
    set({ isLoading: true, error: null });
    try {
      const tickets = await ticketApi.getPaidTickets();
      set({ tickets, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  /**
   * Fetch winner tickets enriched with totalAmount and estimatedAmount
   * — mirrors the web's admin/winner-tickets page.tsx logic:
   *   1. Fetch winner tickets
   *   2. For each winner, fetch the raffle's ticket totals
   *   3. Attach paidQuantity, totalAmount, estimatedAmount
   */
  fetchWinnerTickets: async () => {
    set({ isLoading: true, error: null });
    try {
      const rawWinners = await ticketApi.getWinnerTickets();

      // Fetch raffle totals for each winner's raffle (deduplicated)
      const raffleIds = [...new Set(rawWinners.map((t) => t.donation_formId).filter(Boolean))];
      const totalsByRaffle: Record<string, TicketTotalByRaffle> = {};

      await Promise.all(
        raffleIds.map(async (raffleId) => {
          if (!raffleId) return;
          const totals = await raffleApi.getTicketsAmountByRaffle(raffleId);
          if (totals.length > 0) {
            totalsByRaffle[raffleId] = totals[0];
          }
        }),
      );

      // Enrich each winner ticket
      const enriched: EnrichedWinnerTicket[] = rawWinners.map((ticket) => {
        const totals = ticket.donation_formId
          ? totalsByRaffle[ticket.donation_formId]
          : undefined;
        const totalAmount = totals?._sum.amount ?? 0;
        return {
          ...ticket,
          paidQuantity: totals?._sum.quantity ?? 0,
          totalAmount,
          estimatedAmount: Math.floor(totalAmount / 2),
        };
      });

      set({ winnerTickets: enriched, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchTicketsByRaffle: async (raffleId: string) => {
    try {
      return await ticketApi.getTicketsWhere({ donation_formId: raffleId, paid: true } as any);
    } catch {
      return [];
    }
  },

  clearError: () => set({ error: null }),
}));
