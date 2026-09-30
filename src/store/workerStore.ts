import { create } from 'zustand';
import type { Worker } from '../types';
import { workerApi } from '../services/api/workerApi';

interface WorkerState {
  workers: Worker[];
  isLoading: boolean;
  error: string | null;

  fetchWorkers: (raffleId: string) => Promise<void>;
  addWorker: (worker: Parameters<typeof workerApi.createWorker>[0]) => Promise<Worker>;
  prependWorker: (worker: Worker) => void;
  removeWorker: (workerId: string) => Promise<void>;
  clearError: () => void;
}

export const useWorkerStore = create<WorkerState>((set) => ({
  workers: [],
  isLoading: false,
  error: null,

  fetchWorkers: async (raffleId: string) => {
    set({ isLoading: true, error: null });
    try {
      const workers = await workerApi.getWorkersByRaffle(raffleId);
      set({ workers, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  addWorker: async (worker) => {
    set({ isLoading: true, error: null });
    try {
      const created = await workerApi.createWorker(worker);
      set((state) => ({
        workers: [created, ...state.workers],
        isLoading: false,
      }));
      return created;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  prependWorker: (worker) => {
    set((state) => {
      if (state.workers.some((w) => w.id === worker.id)) {
        return state;
      }
      return { workers: [worker, ...state.workers] };
    });
  },

  removeWorker: async (workerId: string) => {
    set({ isLoading: true, error: null });
    try {
      await workerApi.deleteWorker(workerId);
      set((state) => ({
        workers: state.workers.filter((w) => w.id !== workerId),
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
