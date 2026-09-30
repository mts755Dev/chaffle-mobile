import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../services/supabase/client';
import { clearTapToPayTermsSession } from '../services/tapToPayTermsState';
import { useRaffleStore } from './raffleStore';
import { useTicketStore } from './ticketStore';
import {
  deriveAdminRole,
  readMetadataRole,
} from '../utils/authRoles';
import { fetchOwnedOrganizationIds } from '../services/api/raffleApi';
import type { User, Session } from '@supabase/supabase-js';
import type { AdminRole, OrgApprovalStatus, Worker } from '../types';

/** Prevents onAuthStateChange from overwriting login/signup state mid-flow. */
let authFlowInProgress = false;

/** App admin/org/worker soft session cap (client requirement). */
const ADMIN_SESSION_STARTED_KEY = 'chaffle_admin_session_started_at';
const ADMIN_SESSION_MAX_MS = 2 * 60 * 60 * 1000;

async function readSessionStartedAt(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(ADMIN_SESSION_STARTED_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function writeSessionStartedAt(ts: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(ADMIN_SESSION_STARTED_KEY, String(ts));
  } catch {}
}

async function clearSessionStartedAt(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ADMIN_SESSION_STARTED_KEY);
  } catch {}
}

/** Workers may use the app but cannot accept Tap to Pay Terms (3.8 / 3.8.1). */
function resolveCanManageTapToPay(user: User | null): boolean {
  if (!user) return false;
  return readMetadataRole(user) !== 'worker';
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
  /** Returns false if the local 2h admin session expired and user was signed out. */
  enforceSessionWindow: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, organizationName: string) => Promise<void>;
  createWorker: (
    email: string,
    password: string,
    raffleId: string,
    organizationId: string | null,
    durationHours: number,
  ) => Promise<Worker | void>;
  connectStripe: () => Promise<string>;
  refreshStripeStatus: () => Promise<{ charges_enabled: boolean }>;
  refreshOrgState: () => Promise<void>;
  updateOrganizationProfile: (payload: {
    name: string;
  }) => Promise<void>;
  updatePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function deriveRole(user: User | null): AdminRole | null {
  return deriveAdminRole(user);
}

async function prefetchAdminHomeData(user: User) {
  const role = deriveRole(user);
  if (role === 'super_admin') {
    await useRaffleStore.getState().fetchForms(undefined);
    return;
  }
  if (role === 'org_admin') {
    const orgId = deriveOrgId(user);
    if (orgId) {
      await useRaffleStore.getState().fetchForms(orgId);
    }
  }
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

function isWorkerExpired(user: User | null): boolean {
  if (!user) return false;
  const expiresAt = user.user_metadata?.expires_at;
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

async function purgeExpiredWorkerAccount(): Promise<void> {
  try {
    await supabase.functions.invoke('manage-workers', {
      body: { action: 'purge-expired-self' },
    });
  } catch {
    // Best effort — login will still be blocked if purge fails.
  }
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
  const stripeJson = data.stripe_account_json as { charges_enabled?: boolean; id?: string } | null;
  const stripeAccountId = data.stripe_account_id ?? stripeJson?.id ?? null;
  // Account ID alone means onboarding started — only charges_enabled means ready.
  const connected = !!stripeJson?.charges_enabled;
  return {
    id: stripeAccountId,
    connected,
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
  if (!user) {
    return {
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
    };
  }

  const derivedRole = deriveRole(user);
  const role = derivedRole ?? preserve?.role ?? null;

  // Super admin must never inherit a stale org scope from a previous session.
  const organizationId =
    role === 'super_admin'
      ? null
      : deriveOrgId(user) ?? preserve?.organizationId ?? null;

  const organizationName =
    role === 'super_admin'
      ? null
      : deriveOrgName(user) ?? preserve?.organizationName ?? orgState.name;
  const orgApprovalStatus =
    role === 'org_admin'
      ? orgState.approvalStatus ?? preserve?.orgApprovalStatus ?? null
      : null;

  return {
    user,
    session,
    isAdmin: role !== null,
    canManageTapToPay: resolveCanManageTapToPay(user),
    role,
    organizationId,
    organizationName,
    raffleId: role === 'worker' ? deriveRaffleId(user) : null,
    orgStripeAccountId: role === 'super_admin' ? null : orgState.id,
    orgStripeConnected: role === 'super_admin' ? false : orgState.connected,
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

        let startedAt = await readSessionStartedAt();
        if (!startedAt) {
          startedAt = Date.now();
          await writeSessionStartedAt(startedAt);
        }
        if (Date.now() - startedAt > ADMIN_SESSION_MAX_MS) {
          await clearSessionStartedAt();
          await supabase.auth.signOut();
          set({ isLoading: false, error: 'Session expired — please sign in again' });
          return;
        }

        if (deriveRole(user) === 'worker' && isWorkerExpired(user)) {
          await purgeExpiredWorkerAccount();
          await clearSessionStartedAt();
          await supabase.auth.signOut();
          set({ isLoading: false, error: 'Your worker account has expired' });
          return;
        }

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

        if (user) {
          await prefetchAdminHomeData(user);
        }

        set({
          ...buildAuthPatch(user, session, orgState),
          isLoading: false,
        });
      } else {
        await clearSessionStartedAt();
        set({ isLoading: false });
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        void (async () => {
          if (authFlowInProgress) return;

          const prev = get();
          const user = session?.user ?? null;

          if (user && deriveRole(user) === 'worker' && isWorkerExpired(user)) {
            await purgeExpiredWorkerAccount();
            await clearSessionStartedAt();
            await supabase.auth.signOut();
            useRaffleStore.getState().reset();
            useTicketStore.getState().reset();
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

          if (!user) {
            await clearSessionStartedAt();
          }

          const derivedRole = deriveRole(user);
          const orgId =
            derivedRole === 'super_admin'
              ? null
              : deriveOrgId(user) ?? prev.organizationId;
          let orgState = {
            id: null as string | null,
            connected: false,
            name: null as string | null,
            approvalStatus: null as OrgApprovalStatus | null,
          };
          const resolvedRole = derivedRole ?? prev.role;
          if (user && orgId) {
            if (
              shouldLoadOrgStripe(user) ||
              resolvedRole === 'org_admin'
            ) {
              orgState = await fetchOrgState(orgId);
            }
          }

          console.log('[auth.onAuthStateChange]', {
            derivedRole,
            resolvedRole,
            orgId,
            email: user?.email,
          });

          set(
            buildAuthPatch(user, session, orgState, {
              // Only preserve role when JWT has no role claim yet (legacy).
              role: derivedRole ? undefined : prev.role,
              organizationId:
                derivedRole === 'super_admin'
                  ? null
                  : derivedRole
                    ? deriveOrgId(user)
                    : prev.organizationId,
              organizationName:
                derivedRole === 'super_admin' ? null : prev.organizationName,
              orgApprovalStatus:
                derivedRole === 'org_admin' ? prev.orgApprovalStatus : null,
            }),
          );
        })();
      });
    } catch {
      set({ isLoading: false });
    }
  },

  enforceSessionWindow: async () => {
    const { user, session } = get();
    if (!user || !session) return true;

    const startedAt = await readSessionStartedAt();
    if (!startedAt) {
      await writeSessionStartedAt(Date.now());
      return true;
    }
    if (Date.now() - startedAt <= ADMIN_SESSION_MAX_MS) {
      return true;
    }

    await get().logout();
    set((state) => ({
      ...state,
      error: 'Session expired — please sign in again',
    }));
    return false;
  },

  login: async (email: string, password: string) => {
    authFlowInProgress = true;
    set({ isLoading: true, error: null });
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        const message = /banned/i.test(error.message)
          ? 'This account is no longer available. If your organization was removed, you can sign up again with the same email.'
          : error.message;
        set({ error: message, isLoading: false });
        return;
      }

      let user = data.user;

      if (deriveRole(user) === 'worker' && isWorkerExpired(user)) {
        await purgeExpiredWorkerAccount();
        await supabase.auth.signOut();
        set({ error: 'Your worker account has expired', isLoading: false });
        return;
      }

      if (
        readMetadataRole(user) === 'org_admin' &&
        !deriveOrgId(user)
      ) {
        // Reuse an org this user already owns before minting a new empty one.
        const { data: existingOwned } = await supabase
          .from('organization')
          .select('id, name')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingOwned?.id) {
          await supabase.auth.updateUser({
            data: {
              role: 'org_admin',
              organization_id: existingOwned.id,
              organization_name: existingOwned.name,
            },
          });
        } else if (user.user_metadata?.organization_name) {
          const orgName = user.user_metadata.organization_name as string;
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
      } else if (
        readMetadataRole(user) === 'org_admin' &&
        deriveOrgId(user)
      ) {
        // If metadata points at an org they don't own, snap back to an owned org.
        const metaOrgId = deriveOrgId(user)!;
        const ownedIds = await fetchOwnedOrganizationIds(user.id);
        if (ownedIds.length > 0 && !ownedIds.includes(metaOrgId)) {
          const { data: primary } = await supabase
            .from('organization')
            .select('id, name')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (primary?.id) {
            console.warn('[auth.login] remapping stale organization_id', {
              from: metaOrgId,
              to: primary.id,
            });
            await supabase.auth.updateUser({
              data: {
                role: 'org_admin',
                organization_id: primary.id,
                organization_name: primary.name,
              },
            });
          }
        }
      }

      const refreshed = await refreshAuthUser(user, data.session);
      user = refreshed.user;

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

      if (loginOrgState.approvalStatus === 'terminated') {
        await supabase.auth.signOut();
        set({
          error: 'Your organization has been terminated. You can no longer sign in.',
          isLoading: false,
        });
        return;
      }

      await prefetchAdminHomeData(user);

      await writeSessionStartedAt(Date.now());
      set({
        ...buildAuthPatch(user, refreshed.session, loginOrgState),
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

      // Best practice: account is created, but user must sign in explicitly.
      await supabase.auth.signOut();
      useRaffleStore.getState().reset();
      useTicketStore.getState().reset();

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
        error: null,
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
    // Do NOT set auth isLoading — AppNavigator unmounts the whole stack when it is true.
    set({ error: null });
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

      set({ error: null });
      return data?.worker as Worker | undefined;
    } catch (err: any) {
      const message = err?.message || 'Failed to create worker';
      set({ error: message });
      throw new Error(message);
    }
  },

  connectStripe: async () => {
    const { organizationId, role, orgApprovalStatus } = get();
    if (!organizationId) throw new Error('No organization found');
    if (role === 'org_admin' && orgApprovalStatus !== 'approved') {
      throw new Error(
        'Stripe Connect is available after a super admin approves your organization.',
      );
    }

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

  updateOrganizationProfile: async ({ name }) => {
    const { organizationId, user, session, role } = get();
    if (role !== 'org_admin') {
      throw new Error('Only organization admins can update organization profile');
    }
    if (!organizationId || !user) {
      throw new Error('No organization found');
    }

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw new Error('Organization name must be at least 2 characters');
    }

    const { error: orgError } = await supabase
      .from('organization')
      .update({ name: trimmed })
      .eq('id', organizationId)
      .eq('owner_id', user.id);

    if (orgError) throw new Error(orgError.message || 'Failed to update organization');

    const { data: updatedUserData, error: metaError } = await supabase.auth.updateUser({
      data: {
        organization_name: trimmed,
      },
    });

    if (metaError) throw new Error(metaError.message || 'Failed to update profile');

    const nextUser = updatedUserData.user ?? user;
    set({
      user: nextUser,
      organizationName: trimmed,
      session: session,
    });
  },

  updatePassword: async ({ currentPassword, newPassword }) => {
    const { user } = get();
    const email = user?.email;
    if (!email) throw new Error('No signed-in user');

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      throw new Error('Current password is incorrect');
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message || 'Failed to update password');
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
    } catch {
      // Still clear local session even if remote sign-out fails
    }
    await clearSessionStartedAt();
    clearTapToPayTermsSession();
    useRaffleStore.getState().reset();
    useTicketStore.getState().reset();
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
  },

  clearError: () => set({ error: null }),
}));
