import { supabase } from '../supabase/client';
import type { Worker } from '../../types';

export const workerApi = {
  getWorkersByRaffle: async (raffleId: string): Promise<Worker[]> => {
    const { data, error } = await supabase
      .from('worker')
      .select('*')
      .eq('raffle_id', raffleId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
    const { error } = await supabase
      .from('worker')
      .delete()
      .eq('id', workerId);
    if (error) throw error;
  },
};
