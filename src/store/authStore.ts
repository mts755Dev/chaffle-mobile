import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import { clearTapToPayTermsSession } from '../services/tapToPayTermsState';
import { useRaffleStore } from './raffleStore';
import { deriveAdminRole, isSuperAdminUser } from '../utils/authRoles';
import type { User, Session } from '@supabase/supabase-js';
import type { AdminRole, OrgApprovalStatus } from '../types';

/** Prevents onAuthStateChange from overwriting login/signup state mid-flow. */
let authFlowInProgress = false;

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
  orgApprovalStatus: OrgApprovalStatus | null;
  error: string | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, organizationName: string) => Promise<void>;
  createWorker: (email: string, password: string, raffleId: string, organizationId: string | null, durationHours: number) => Promise<void>;
  connectStripe: () => Promise<string>;
  refreshStripeStatus: () => Promise<{ charges_enabled: boolean }>;
  refreshOrgState: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function readMetadataRole(user: User | null): string | undefined {
  if (!user) return undefined;
  return (
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined)
  );
}

function deriveRole(user: User | null): AdminRole | null {
  return deriveAdminRole(user);
}

function deriveOrgId(user: User | null): string | null {
  if (!user) return null;
  return (
    (user.user_metadata?.organization_id as string | undefined) ??
    (user.app_metadata?.organization_id as string | undefined) ??
    null
  );
}

function deriveOrgName(user: User | null): string | null {
  if (!user) return null;
  return (
    (user.user_metadata?.organization_name as string | undefined) ??
    (user.app_metadata?.organization_name as string | undefined) ??
    null
  );
}

function deriveRaffleId(user: User | null): string | null {
  if (!user) return null;
  return (
    (user.user_metadata?.raffle_id as string | undefined) ??
    (user.app_metadata?.raffle_id as string | undefined) ??
    null
  );
}

async function refreshAuthUser(
  fallbackUser: User,
  fallbackSession: Session | null,
): Promise<{ user: User; session: Session | null }> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.user) {
    return { user: fallbackUser, session: fallbackSession };
  }
  return { user: data.session.user, session: data.session };
}

/** Legacy web super admins may lack role=admin in JWT; patch so RLS policies work. */
async function ensureSuperAdminJwtMetadata(
  user: User,
  session: Session | null,
): Promise<{ user: User; session: Session | null }> {
  if (!isSuperAdminUser(user)) {
    return { user, session };
  }

  if (readMetadataRole(user) === 'admin') {
    return { user, session };
  }

  const { error } = await supabase.auth.updateUser({
    data: { role: 'admin' },
  });

  if (error) {
    return { user, session };
  }

  return refreshAuthUser(user, session);
}

function isWorkerExpired(user: User | null): boolean {
  if (!user) return false;
  const expiresAt = user.user_metadata?.expires_at;
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

async function fetchOrgState(orgId: string): Promise<{
  id: string | null;
  connected: boolean;
  name: string | null;
  approvalStatus: OrgApprovalStatus | null;
}> {
  const { data } = await supabase
    .from('organization')
    .select('stripe_account_id, stripe_account_json, name, approval_status')
    .eq('id', orgId)
    .single();
  if (!data) {
    return { id: null, connected: false, name: null, approvalStatus: null };
  }
  return {
    id: data.stripe_account_id ?? null,
    connected: !!(data.stripe_account_json as any)?.charges_enabled,
    name: data.name ?? null,
    approvalStatus: (data.approval_status as OrgApprovalStatus) ?? 'pending',
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
  orgState: {
    id: string | null;
    connected: boolean;
    name: string | null;
    approvalStatus: OrgApprovalStatus | null;
  },
  preserve?: {
    role?: AdminRole | null;
    organizationId?: string | null;
    organizationName?: string | null;
    orgApprovalStatus?: OrgApprovalStatus | null;
  },
) {
  const role = deriveRole(user) ?? preserve?.role ?? null;
  const organizationId = deriveOrgId(user) ?? preserve?.organizationId ?? null;
  const organizationName =
    deriveOrgName(user) ?? preserve?.organizationName ?? orgState.name;
  const orgApprovalStatus =
    role === 'org_admin'
      ? orgState.approvalStatus ?? preserve?.orgApprovalStatus ?? null
      : null;

  return {
    user,
    session,
    isAdmin: !!user && role !== null,
    canManageTapToPay: resolveCanManageTapToPay(user),
    role,
    organizationId,
    organizationName,
    raffleId: deriveRaffleId(user),
    orgStripeAccountId: orgState.id,
    orgStripeConnected: orgState.connected,
    orgApprovalStatus,
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
  orgApprovalStatus: null,
  error: null,

  initialize: async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        set({ isLoading: false });
        return;
      }
      if (data?.session) {
        let user = data.session.user;
        let session = data.session;

        if (deriveRole(user) === 'worker' && isWorkerExpired(user)) {
          await supabase.auth.signOut();
          set({ isLoading: false, error: 'Your worker account has expired' });
          return;
        }

        const synced = await ensureSuperAdminJwtMetadata(user, session);
        user = synced.user;
        session = synced.session ?? session;

        const orgId = deriveOrgId(user);
        let orgState = {
          id: null as string | null,
          connected: false,
          name: null as string | null,
          approvalStatus: null as OrgApprovalStatus | null,
        };
        if (shouldLoadOrgStripe(user) && orgId) {
          orgState = await fetchOrgState(orgId);
        } else if (deriveRole(user) === 'org_admin' && orgId) {
          orgState = await fetchOrgState(orgId);
        }

        set({
          ...buildAuthPatch(user, session, orgState),
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        void (async () => {
          if (authFlowInProgress) return;

          const prev = get();
          const user = session?.user ?? null;

          if (user && deriveRole(user) === 'worker' && isWorkerExpired(user)) {
            await supabase.auth.signOut();
            useRaffleStore.getState().reset();
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
              orgApprovalStatus: null,
              error: 'Your worker account has expired',
            });
            return;
          }

          const orgId = deriveOrgId(user) ?? prev.organizationId;
          let orgState = {
            id: null as string | null,
            connected: false,
            name: null as string | null,
            approvalStatus: null as OrgApprovalStatus | null,
          };
          const resolvedRole = deriveRole(user) ?? prev.role;
          if (user && orgId) {
            if (
              shouldLoadOrgStripe(user) ||
              resolvedRole === 'org_admin'
            ) {
              orgState = await fetchOrgState(orgId);
            }
          }

          set(
            buildAuthPatch(user, session, orgState, {
              role: prev.role,
              organizationId: prev.organizationId,
              organizationName: prev.organizationName,
              orgApprovalStatus: prev.orgApprovalStatus,
            }),
          );
        })();
      });
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    authFlowInProgress = true;
    useRaffleStore.getState().reset();
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

      let user = data.user;

      if (deriveRole(user) === 'worker' && isWorkerExpired(user)) {
        await supabase.auth.signOut();
        set({ error: 'Your worker account has expired', isLoading: false });
        return;
      }

      if (
        readMetadataRole(user) === 'org_admin' &&
        !deriveOrgId(user) &&
        user.user_metadata?.organization_name
      ) {
        const orgName = user.user_metadata.organization_name;
        const { data: orgData } = await supabase
          .from('organization')
          .insert({
            name: orgName,
            owner_id: user.id,
            contact_email: normalizedEmail,
            approval_status: 'pending',
          })
          .select()
          .single();

        if (orgData) {
          await supabase.auth.updateUser({
            data: {
              organization_id: orgData.id,
              organization_name: orgName,
            },
          });
        }
      }

      const refreshed = await refreshAuthUser(user, data.session);
      user = refreshed.user;

      const synced = await ensureSuperAdminJwtMetadata(user, refreshed.session);
      user = synced.user;

      const loginOrgId = deriveOrgId(user);
      let loginOrgState = {
        id: null as string | null,
        connected: false,
        name: null as string | null,
        approvalStatus: null as OrgApprovalStatus | null,
      };
      if (loginOrgId && (shouldLoadOrgStripe(user) || deriveRole(user) === 'org_admin')) {
        loginOrgState = await fetchOrgState(loginOrgId);
      }

      set({
        ...buildAuthPatch(user, synced.session ?? refreshed.session, loginOrgState),
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
    } finally {
      authFlowInProgress = false;
    }
  },

  signup: async (email: string, password: string, organizationName: string) => {
    authFlowInProgress = true;
    useRaffleStore.getState().reset();
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

      const normalizedSignupEmail = email.trim().toLowerCase();
      const { data: orgData, error: orgError } = await supabase
        .from('organization')
        .insert({
          name: organizationName,
          owner_id: signUpData.user.id,
          contact_email: normalizedSignupEmail,
          approval_status: 'pending',
        })
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

      const refreshed = await refreshAuthUser(
        signUpData.user,
        signUpData.session,
      );

      const signupOrgState = await fetchOrgState(orgData.id);

      set({
        ...buildAuthPatch(refreshed.user, refreshed.session, signupOrgState, {
          role: 'org_admin',
          organizationId: orgData.id,
          organizationName,
          orgApprovalStatus: 'pending',
        }),
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Signup failed', isLoading: false });
    } finally {
      authFlowInProgress = false;
    }
  },

  createWorker: async (
    email: string,
    password: string,
    raffleId: string,
    organizationId: string | null,
    durationHours: number,
  ) => {
    set({ isLoading: true, error: null });
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.functions.invoke('create-worker', {
        body: {
          email: normalizedEmail,
          password,
          raffleId,
          organizationId,
          durationHours,
        },
      });

      if (data?.error) {
        throw new Error(String(data.error));
      }

      if (error) {
        let detailedMessage = error.message || 'Failed to create worker';
        const context = (error as { context?: Response }).context;
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

  refreshOrgState: async () => {
    const { organizationId, session } = get();
    const { data } = await supabase.auth.getUser();
    const user = data.user ?? get().user;
    if (!organizationId || !user) return;

    const orgState = await fetchOrgState(organizationId);
    set({
      ...buildAuthPatch(user, session, orgState),
    });
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      clearTapToPayTermsSession();
      useRaffleStore.getState().reset();
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
        orgApprovalStatus: null,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
