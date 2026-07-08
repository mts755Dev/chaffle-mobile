import { create } from 'zustand';
import { Ticket, TicketTotalByRaffle } from '../types';
import { ticketApi, raffleApi } from '../services/api/raffleApi';

export interface EnrichedWinnerTicket extends Ticket {
  paidQuantity?: number;
  totalAmount?: number;
  estimatedAmount?: number;
}

function buildScopeKey(raffleIds?: string[]): string {
  if (raffleIds === undefined) return '__all__';
  if (raffleIds.length === 0) return '__none__';
  return raffleIds.slice().sort().join('|');
}

interface TicketState {
  tickets: Ticket[];
  winnerTickets: EnrichedWinnerTicket[];
  ticketsScopeKey: string | null;
  winnerTicketsScopeKey: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  fetchPaidTickets: (raffleIds?: string[]) => Promise<void>;
  fetchWinnerTickets: (raffleIds?: string[]) => Promise<void>;
  fetchTicketsByRaffle: (raffleId: string) => Promise<Ticket[]>;
  clearError: () => void;
  reset: () => void;
}

export const useTicketStore = create<TicketState>((set, get) => ({
  tickets: [],
  winnerTickets: [],
  ticketsScopeKey: null,
  winnerTicketsScopeKey: null,
  isLoading: false,
  isRefreshing: false,
  error: null,

  fetchPaidTickets: async (raffleIds?: string[]) => {
    const scopeKey = buildScopeKey(raffleIds);
    const { tickets, ticketsScopeKey } = get();
    const hasCached = tickets.length > 0 && ticketsScopeKey === scopeKey;
    const scopeChanged = ticketsScopeKey !== null && ticketsScopeKey !== scopeKey;

    set({
      error: null,
      isLoading: !hasCached,
      isRefreshing: hasCached,
      ...(scopeChanged ? { tickets: [] } : {}),
    });

    try {
      const nextTickets = await ticketApi.getPaidTickets(raffleIds);
      set({
        tickets: nextTickets,
        ticketsScopeKey: scopeKey,
        isLoading: false,
        isRefreshing: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false, isRefreshing: false });
    }
  },

  fetchWinnerTickets: async (raffleIds?: string[]) => {
    const scopeKey = buildScopeKey(raffleIds);
    const { winnerTickets, winnerTicketsScopeKey } = get();
    const hasCached = winnerTickets.length > 0 && winnerTicketsScopeKey === scopeKey;
    const scopeChanged =
      winnerTicketsScopeKey !== null && winnerTicketsScopeKey !== scopeKey;

    set({
      error: null,
      isLoading: !hasCached,
      isRefreshing: hasCached,
      ...(scopeChanged ? { winnerTickets: [] } : {}),
    });

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

      set({
        winnerTickets: enriched,
        winnerTicketsScopeKey: scopeKey,
        isLoading: false,
        isRefreshing: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false, isRefreshing: false });
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

  reset: () =>
    set({
      tickets: [],
      winnerTickets: [],
      ticketsScopeKey: null,
      winnerTicketsScopeKey: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
    }),
}));
