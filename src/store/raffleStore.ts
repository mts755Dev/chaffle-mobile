import { create } from 'zustand';
import { DonationForm, TicketTotalByRaffle, UpdateFormPayload } from '../types';
import { raffleApi } from '../services/api/raffleApi';

function buildFormsScopeKey(organizationId?: string | null): string {
  return organizationId ?? '__all__';
}

interface RaffleState {
  forms: DonationForm[];
  currentForm: DonationForm | null;
  ticketTotals: TicketTotalByRaffle[];
  completedRaffleIds: string[];
  formsScopeKey: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  fetchForms: (organizationId?: string | null) => Promise<void>;
  fetchFormById: (id: string) => Promise<DonationForm | null>;
  fetchTicketTotals: (raffleId?: string, raffleIds?: string[]) => Promise<TicketTotalByRaffle[]>;
  fetchCompletedRaffleIds: (raffleIds?: string[]) => Promise<void>;
  createForm: (
    organizationId?: string | null,
    data?: Omit<UpdateFormPayload, 'id'>,
  ) => Promise<DonationForm>;
  updateForm: (payload: Partial<DonationForm> & { id: string }) => Promise<void>;
  deleteForm: (id: string) => Promise<void>;
  setCurrentForm: (form: DonationForm | null) => void;
  clearError: () => void;
  reset: () => void;
}

export const useRaffleStore = create<RaffleState>((set, get) => ({
  forms: [],
  currentForm: null,
  ticketTotals: [],
  completedRaffleIds: [],
  formsScopeKey: null,
  isLoading: false,
  isRefreshing: false,
  error: null,

  fetchForms: async (organizationId?: string | null) => {
    const scopeKey = buildFormsScopeKey(organizationId);
    const { forms, formsScopeKey } = get();
    const hasCached = forms.length > 0 && formsScopeKey === scopeKey;
    const scopeChanged = formsScopeKey !== null && formsScopeKey !== scopeKey;

    set({
      error: null,
      isLoading: !hasCached,
      isRefreshing: hasCached,
      ...(scopeChanged ? { forms: [] } : {}),
    });

    try {
      const nextForms = await raffleApi.getDonationForms(organizationId);
      set({
        forms: nextForms,
        formsScopeKey: scopeKey,
        isLoading: false,
        isRefreshing: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false, isRefreshing: false });
    }
  },

  fetchFormById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const form = await raffleApi.getDonationFormById(id);
      set({ currentForm: form, isLoading: false });
      return form;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return null;
    }
  },

  fetchTicketTotals: async (raffleId?: string, raffleIds?: string[]) => {
    try {
      const totals = await raffleApi.getTicketsAmountByRaffle(raffleId, raffleIds);
      set({ ticketTotals: totals });
      return totals;
    } catch {
      return [];
    }
  },

  fetchCompletedRaffleIds: async (raffleIds?: string[]) => {
    try {
      const ids = await raffleApi.getCompletedRaffleIds(raffleIds);
      set({ completedRaffleIds: ids });
    } catch {
      // Silently fail
    }
  },

  createForm: async (
    organizationId?: string | null,
    data?: Omit<UpdateFormPayload, 'id'>,
  ) => {
    set({ isLoading: true, error: null });
    try {
      const form = await raffleApi.createDonationForm(organizationId, data);
      set((state) => ({
        forms: [...state.forms, form],
        currentForm: form,
        isLoading: false,
      }));
      return form;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  updateForm: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await raffleApi.updateForm(payload);
      set((state) => ({
        forms: state.forms.map((f) => (f.id === payload.id ? updated : f)),
        currentForm: state.currentForm?.id === payload.id ? updated : state.currentForm,
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  deleteForm: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await raffleApi.deleteDonation(id);
      set((state) => ({
        forms: state.forms.filter((f) => f.id !== id),
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  setCurrentForm: (form) => set({ currentForm: form }),
  clearError: () => set({ error: null }),
  reset: () =>
    set({
      forms: [],
      currentForm: null,
      ticketTotals: [],
      completedRaffleIds: [],
      formsScopeKey: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
    }),
}));
