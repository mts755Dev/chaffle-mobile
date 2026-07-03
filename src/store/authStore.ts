import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import { clearTapToPayTermsSession } from '../services/tapToPayTermsState';
import { workerApi } from '../services/api/workerApi';
import { workerDuplicateEmailMessage } from '../utils/workerEmail';
import type { User, Session } from '@supabase/supabase-js';
import type { AdminRole } from '../types';

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
  role: AdminRole | null;
  organizationId: string | null;
  organizationName: string | null;
  raffleId: string | null;
  orgStripeAccountId: string | null;
  orgStripeConnected: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, organizationName: string) => Promise<void>;
  createWorker: (email: string, password: string, raffleId: string, organizationId: string, durationHours: number) => Promise<void>;
  connectStripe: () => Promise<string>;
  refreshStripeStatus: () => Promise<{ charges_enabled: boolean }>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function deriveRole(user: User | null): AdminRole | null {
  if (!user) return null;
  const metaRole = user.user_metadata?.role;
  if (metaRole === 'admin') return 'super_admin';
  if (metaRole === 'org_admin') return 'org_admin';
  if (metaRole === 'worker') return 'worker';
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

function deriveRaffleId(user: User | null): string | null {
  if (!user) return null;
  return user.user_metadata?.raffle_id || null;
}

function isWorkerExpired(user: User | null): boolean {
  if (!user) return false;
  const expiresAt = user.user_metadata?.expires_at;
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

async function fetchOrgStripeState(orgId: string): Promise<{
  id: string | null;
  connected: boolean;
  name: string | null;
}> {
  const { data } = await supabase
    .from('organization')
    .select('stripe_account_id, stripe_account_json, name')
    .eq('id', orgId)
    .single();
  if (!data) return { id: null, connected: false, name: null };
  return {
    id: data.stripe_account_id ?? null,
    connected: !!(data.stripe_account_json as any)?.charges_enabled,
    name: data.name ?? null,
  };
}

function shouldLoadOrgStripe(user: User | null): boolean {
  const role = deriveRole(user);
  const orgId = deriveOrgId(user);
  return !!orgId && (role === 'org_admin' || role === 'worker');
}

function buildAuthPatch(
  user: User | null,
  session: Session | null,
  stripeState: { id: string | null; connected: boolean; name: string | null },
) {
  return {
    user,
    session,
    isAdmin: !!user,
    canManageTapToPay: resolveCanManageTapToPay(user),
    role: deriveRole(user),
    organizationId: deriveOrgId(user),
    organizationName: deriveOrgName(user) ?? stripeState.name,
    raffleId: deriveRaffleId(user),
    orgStripeAccountId: stripeState.id,
    orgStripeConnected: stripeState.connected,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAdmin: false,
  canManageTapToPay: false,
  role: null,
  organizationId: null,
  organizationName: null,
  raffleId: null,
  orgStripeAccountId: null,
  orgStripeConnected: false,
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

        if (deriveRole(user) === 'worker' && isWorkerExpired(user)) {
          await supabase.auth.signOut();
          set({ isLoading: false, error: 'Your worker account has expired' });
          return;
        }

        const orgId = deriveOrgId(user);
        let stripeState = { id: null as string | null, connected: false, name: null as string | null };
        if (shouldLoadOrgStripe(user) && orgId) {
          stripeState = await fetchOrgStripeState(orgId);
        }

        set({
          ...buildAuthPatch(user, data.session, stripeState),
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        void (async () => {
          const user = session?.user ?? null;

          if (user && deriveRole(user) === 'worker' && isWorkerExpired(user)) {
            await supabase.auth.signOut();
            set({
              user: null,
              session: null,
              isAdmin: false,
              canManageTapToPay: false,
              role: null,
              organizationId: null,
              organizationName: null,
              raffleId: null,
              orgStripeAccountId: null,
              orgStripeConnected: false,
              error: 'Your worker account has expired',
            });
            return;
          }

          const orgId = deriveOrgId(user);
          let stripeState = { id: null as string | null, connected: false, name: null as string | null };
          if (user && shouldLoadOrgStripe(user) && orgId) {
            stripeState = await fetchOrgStripeState(orgId);
          }

          set(buildAuthPatch(user, session, stripeState));
        })();
      });
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return;
      }

      const user = data.user;

      if (deriveRole(user) === 'worker' && isWorkerExpired(user)) {
        await supabase.auth.signOut();
        set({ error: 'Your worker account has expired', isLoading: false });
        return;
      }

      if (
        user.user_metadata?.role === 'org_admin' &&
        !user.user_metadata?.organization_id &&
        user.user_metadata?.organization_name
      ) {
        const orgName = user.user_metadata.organization_name;
        const { data: orgData } = await supabase
          .from('organization')
          .insert({ name: orgName, owner_id: user.id })
          .select()
          .single();

        if (orgData) {
          await supabase.auth.updateUser({
            data: {
              organization_id: orgData.id,
              organization_name: orgName,
            },
          });
          user.user_metadata.organization_id = orgData.id;
        }
      }

      const loginOrgId = deriveOrgId(user);
      let loginStripe = { id: null as string | null, connected: false, name: null as string | null };
      if (shouldLoadOrgStripe(user) && loginOrgId) {
        loginStripe = await fetchOrgStripeState(loginOrgId);
      }

      set({
        ...buildAuthPatch(user, data.session, loginStripe),
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
        canManageTapToPay: true,
        role: 'org_admin',
        organizationId: orgData.id,
        organizationName,
        raffleId: null,
        orgStripeAccountId: null,
        orgStripeConnected: false,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Signup failed', isLoading: false });
    }
  },

  createWorker: async (
    email: string,
    password: string,
    raffleId: string,
    organizationId: string,
    durationHours: number,
  ) => {
    set({ isLoading: true, error: null });
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const existingWorker = await workerApi.findExistingWorkerByEmail(
        organizationId,
        normalizedEmail,
      );
      if (existingWorker) {
        throw new Error(
          workerDuplicateEmailMessage(existingWorker.raffle_id, raffleId),
        );
      }

      const { data, error } = await supabase.functions.invoke('create-worker', {
        body: {
          email: normalizedEmail,
          password,
          raffleId,
          organizationId,
          durationHours,
        },
      });

      if (error) {
        let detailedMessage = error.message || 'Failed to create worker';
        const context = (error as any)?.context;
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
        throw new Error(detailedMessage);
      }
      if (data?.error) throw new Error(data.error);

      set({ isLoading: false, error: null });
    } catch (err: any) {
      const message = err?.message || 'Failed to create worker';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  connectStripe: async () => {
    const { organizationId } = get();
    if (!organizationId) throw new Error('No organization found');

    const { data, error } = await supabase.functions.invoke('stripe-connect-onboarding', {
      body: { action: 'create', organizationId },
    });

    if (error) throw new Error(error.message || 'Failed to start Stripe onboarding');
    if (data?.error) throw new Error(data.error);

    if (data?.accountId) {
      set({ orgStripeAccountId: data.accountId });
    }

    return data.onboardingUrl as string;
  },

  refreshStripeStatus: async () => {
    const { organizationId } = get();
    if (!organizationId) throw new Error('No organization found');

    const { data, error } = await supabase.functions.invoke('stripe-connect-onboarding', {
      body: { action: 'refresh', organizationId },
    });

    if (error) throw new Error(error.message || 'Failed to refresh Stripe status');
    if (data?.error) throw new Error(data.error);

    set({ orgStripeConnected: !!data.charges_enabled });
    return { charges_enabled: !!data.charges_enabled };
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
        role: null,
        organizationId: null,
        organizationName: null,
        raffleId: null,
        orgStripeAccountId: null,
        orgStripeConnected: false,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
