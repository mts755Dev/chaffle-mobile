import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import { clearTapToPayTermsSession } from '../services/tapToPayTermsState';
import type { User, Session } from '@supabase/supabase-js';

/** Workers may use the app but cannot accept Tap to Pay Terms (3.8 / 3.8.1). */
function resolveCanManageTapToPay(user: User | null): boolean {
  if (!user) return false;
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);
  return role !== 'worker';
}

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  /** False for worker role — cannot enable Tap to Pay or accept Apple T&C. */
  canManageTapToPay: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAdmin: false,
  canManageTapToPay: false,
  error: null,

  initialize: async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        set({ isLoading: false });
        return;
      }
      if (data?.session) {
        set({
          user: data.session.user,
          session: data.session,
          isAdmin: true,
          canManageTapToPay: resolveCanManageTapToPay(data.session.user),
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user ?? null;
        set({
          user,
          session,
          isAdmin: !!user,
          canManageTapToPay: resolveCanManageTapToPay(user),
        });
      });
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return;
      }

      set({
        user: data.user,
        session: data.session,
        isAdmin: true,
        canManageTapToPay: resolveCanManageTapToPay(data.user),
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      clearTapToPayTermsSession();
      set({
        user: null,
        session: null,
        isAdmin: false,
        canManageTapToPay: false,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
