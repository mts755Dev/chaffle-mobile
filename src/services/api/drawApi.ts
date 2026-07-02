import { AxiosError } from 'axios';
import type { Ticket } from '../../types';
import apiClient from './client';

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

function getApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  if (error instanceof Error) return error.message;
  return 'Request failed';
}

export const drawApi = {
  /** Admin manual draw — uses the same server path as web drawWinner. */
  drawWinner: async (raffleId: string): Promise<DrawResult> => {
    try {
      const { data } = await apiClient.post<DrawResult>('/api/raffle/draw', {
        raffleId,
      });
      return data;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /** Auto-draw when draw_date has passed — mirrors web triggerAutoDrawIfDue. */
  triggerAutoDrawIfDue: async (raffleId: string): Promise<AutoDrawResult> => {
    try {
      const { data } = await apiClient.post<AutoDrawResult>(
        '/api/raffle/auto-draw',
        { raffleId }
      );
      return data;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },
};
