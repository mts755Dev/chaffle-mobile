import { supabase } from '../supabase/client';
import type { Worker } from '../../types';

async function parseFunctionError(error: any, fallback: string): Promise<string> {
  let detailedMessage = error?.message || fallback;
  const context = error?.context;
  if (context) {
    try {
      const body = await context.json();
      detailedMessage = body?.error || body?.message || detailedMessage;
    } catch {
      try {
        const bodyText = await context.text();
        if (bodyText) detailedMessage = bodyText;
      } catch {
        // Keep generic message if response body cannot be parsed.
      }
    }
  }
  return detailedMessage;
}

export const workerApi = {
  getWorkersByRaffle: async (raffleId: string): Promise<Worker[]> => {
    const { data, error } = await supabase.functions.invoke('manage-workers', {
      body: {
        action: 'list-by-raffle',
        raffleId,
      },
    });

    if (data?.error) {
      throw new Error(String(data.error));
    }

    if (error) {
      throw new Error(await parseFunctionError(error, 'Failed to load workers'));
    }

    return (data?.workers as Worker[]) ?? [];
  },

  getWorkerByUserId: async (userId: string): Promise<Worker | null> => {
    const { data, error } = await supabase
      .from('worker')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .single();
    if (error) return null;
    return data;
  },

  createWorker: async (worker: {
    email: string;
    raffle_id: string;
    organization_id: string;
    created_by: string;
    user_id: string;
    expires_at: string;
  }): Promise<Worker> => {
    const { data, error } = await supabase
      .from('worker')
      .insert(worker)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deleteWorker: async (workerId: string): Promise<void> => {
    const { data, error } = await supabase.functions.invoke('delete-worker', {
      body: { workerId },
    });

    if (error) {
      throw new Error(await parseFunctionError(error, 'Failed to delete worker'));
    }
    if (data?.error) {
      throw new Error(String(data.error));
    }
  },

  /** Returns an existing worker row with the same email, if any. */
  findExistingWorkerByEmailGlobal: async (
    email: string,
  ): Promise<Pick<Worker, 'id' | 'raffle_id' | 'email'> | null> => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('worker')
      .select('id, raffle_id, email')
      .ilike('email', normalizedEmail)
      .limit(1);

    if (error) throw error;
    return data?.[0] ?? null;
  },

  /** Returns an existing worker row in this org with the same email, if any. */
  findExistingWorkerByEmail: async (
    organizationId: string,
    email: string,
  ): Promise<Pick<Worker, 'id' | 'raffle_id' | 'email'> | null> => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('worker')
      .select('id, raffle_id, email')
      .eq('organization_id', organizationId)
      .ilike('email', normalizedEmail)
      .limit(1);

    if (error) throw error;
    return data?.[0] ?? null;
  },
};
