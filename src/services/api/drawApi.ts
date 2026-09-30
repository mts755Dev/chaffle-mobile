import type { Ticket } from '../../types';
import { supabase } from '../supabase/client';
import { isRaffleDrawDue } from '../../lib/raffleDates';

export type DrawResult = {
  winnerTicket: Ticket;
  totalEntries: number;
  randomValue: number;
  rngMethod: string;
};

export type AutoDrawResult = {
  drawn: boolean;
  alreadyDrawn?: boolean;
  winnerTicket?: Ticket;
  totalEntries?: number;
  randomValue?: number;
  rngMethod?: string;
};

function getInvokeError(error: unknown, data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const msg = (data as { error?: string }).error;
    if (msg) return msg;
  }
  if (error instanceof Error) return error.message;
  return 'Request failed';
}

export const drawApi = {
  /**
   * Admin manual draw — shared Supabase `raffle-draw` edge (owned by website repo).
   * Same function the website calls.
   */
  drawWinner: async (raffleId: string): Promise<DrawResult> => {
    // Ensure Authorization carries a fresh user JWT so edge can set drawnByUserId.
    const { data: refreshed, error: refreshError } =
      await supabase.auth.getSession();
    if (refreshError || !refreshed.session?.access_token) {
      throw new Error('Unauthorized: no session');
    }

    const { data, error } = await supabase.functions.invoke('raffle-draw', {
      body: { action: 'draw', raffleId },
      headers: {
        Authorization: `Bearer ${refreshed.session.access_token}`,
      },
    });

    if (error || data?.error) {
      throw new Error(getInvokeError(error, data));
    }
    return data as DrawResult;
  },

  /**
   * Auto-draw via the same `raffle-draw` edge function as the website.
   * Client skips the call until Eastern draw time is due.
   */
  triggerAutoDrawIfDue: async (
    raffleId: string,
    drawDate?: string | null,
  ): Promise<AutoDrawResult> => {
    if (drawDate != null && !isRaffleDrawDue(drawDate)) {
      return { drawn: false };
    }

    const { data, error } = await supabase.functions.invoke('raffle-draw', {
      body: { action: 'auto-draw', raffleId },
    });

    if (error || data?.error) {
      throw new Error(getInvokeError(error, data));
    }
    return data as AutoDrawResult;
  },
};
