import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { AdminRole, Organization } from '../types';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  role: AdminRole | null;
  organizationId: string | null;
  organizationName: string | null;
  error: string | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, organizationName: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function deriveRole(user: User | null): AdminRole | null {
  if (!user) return null;
  const metaRole = user.user_metadata?.role;
  if (metaRole === 'admin') return 'super_admin';
  if (metaRole === 'org_admin') return 'org_admin';
  return 'super_admin';
}

function deriveOrgId(user: User | null): string | null {
  if (!user) return null;
  return user.user_metadata?.organization_id || null;
}

function deriveOrgName(user: User | null): string | null {
  if (!user) return null;
  return user.user_metadata?.organization_name || null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAdmin: false,
  role: null,
  organizationId: null,
  organizationName: null,
  error: null,

  initialize: async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        set({ isLoading: false });
        return;
      }
      if (data?.session) {
        const user = data.session.user;
        set({
          user,
          session: data.session,
          isAdmin: true,
          role: deriveRole(user),
          organizationId: deriveOrgId(user),
          organizationName: deriveOrgName(user),
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user || null;
        set({
          user,
          session,
          isAdmin: !!user,
          role: deriveRole(user),
          organizationId: deriveOrgId(user),
          organizationName: deriveOrgName(user),
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

      const user = data.user;
      set({
        user,
        session: data.session,
        isAdmin: true,
        role: deriveRole(user),
        organizationId: deriveOrgId(user),
        organizationName: deriveOrgName(user),
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
    }
  },

  signup: async (email: string, password: string, organizationName: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: 'org_admin',
            organization_name: organizationName,
          },
        },
      });

      if (signUpError) {
        set({ error: signUpError.message, isLoading: false });
        return;
      }

      if (!signUpData.user) {
        set({ error: 'Signup failed — no user returned', isLoading: false });
        return;
      }

      const { data: orgData, error: orgError } = await supabase
        .from('organization')
        .insert({ name: organizationName, owner_id: signUpData.user.id })
        .select()
        .single();

      if (orgError) {
        set({ error: orgError.message, isLoading: false });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          role: 'org_admin',
          organization_id: orgData.id,
          organization_name: organizationName,
        },
      });

      if (updateError) {
        set({ error: updateError.message, isLoading: false });
        return;
      }

      const user = signUpData.user;
      user.user_metadata = {
        ...user.user_metadata,
        role: 'org_admin',
        organization_id: orgData.id,
        organization_name: organizationName,
      };

      set({
        user,
        session: signUpData.session,
        isAdmin: true,
        role: 'org_admin',
        organizationId: orgData.id,
        organizationName,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Signup failed', isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      set({
        user: null,
        session: null,
        isAdmin: false,
        role: null,
        organizationId: null,
        organizationName: null,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
