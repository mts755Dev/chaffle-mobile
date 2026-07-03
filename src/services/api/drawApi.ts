import type { Ticket } from '../../types';
import { supabase } from '../supabase/client';

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
  /** Admin manual draw — Supabase edge function (same algorithm as web). */
  drawWinner: async (raffleId: string): Promise<DrawResult> => {
    const { data, error } = await supabase.functions.invoke('raffle-draw', {
      body: { action: 'draw', raffleId },
    });

    if (error || data?.error) {
      throw new Error(getInvokeError(error, data));
    }
    return data as DrawResult;
  },

  /** Auto-draw when draw_date has passed — mirrors web triggerAutoDrawIfDue. */
  triggerAutoDrawIfDue: async (raffleId: string): Promise<AutoDrawResult> => {
    const { data, error } = await supabase.functions.invoke('raffle-draw', {
      body: { action: 'auto-draw', raffleId },
    });

    if (error || data?.error) {
      throw new Error(getInvokeError(error, data));
    }
    return data as AutoDrawResult;
  },
};
