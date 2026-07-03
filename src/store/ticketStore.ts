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

  fetchPaidTickets: (raffleIds?: string[]) => Promise<void>;
  fetchWinnerTickets: (raffleIds?: string[]) => Promise<void>;
  fetchTicketsByRaffle: (raffleId: string) => Promise<Ticket[]>;
  clearError: () => void;
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  winnerTickets: [],
  isLoading: false,
  error: null,

  fetchPaidTickets: async (raffleIds?: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const tickets = await ticketApi.getPaidTickets(raffleIds);
      set({ tickets, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchWinnerTickets: async (raffleIds?: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const rawWinners = await ticketApi.getWinnerTickets(raffleIds);

      const winnerRaffleIds = [...new Set(rawWinners.map((t) => t.donation_formId).filter(Boolean))];
      const totalsByRaffle: Record<string, TicketTotalByRaffle> = {};

      await Promise.all(
        winnerRaffleIds.map(async (raffleId) => {
          if (!raffleId) return;
          const totals = await raffleApi.getTicketsAmountByRaffle(raffleId);
          if (totals.length > 0) {
            totalsByRaffle[raffleId] = totals[0];
          }
        }),
      );

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
