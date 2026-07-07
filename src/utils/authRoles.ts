import type { User } from '@supabase/supabase-js';
import type { AdminRole } from '../types';

function readMetadataRole(user: User): string | undefined {
  return (
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined)
  );
}

function readOrgId(user: User): string | null {
  return (
    (user.user_metadata?.organization_id as string | undefined) ??
    (user.app_metadata?.organization_id as string | undefined) ??
    null
  );
}

function readRaffleId(user: User): string | null {
  return (
    (user.user_metadata?.raffle_id as string | undefined) ??
    (user.app_metadata?.raffle_id as string | undefined) ??
    null
  );
}

/** Matches chaffle/lib/authRoles.ts isWebSuperAdmin */
export function isSuperAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;

  const role = readMetadataRole(user);
  if (role === 'admin' || role === 'super_admin') return true;
  if (role === 'org_admin' || role === 'worker') return false;

  if (user.user_metadata?.firstName && !readOrgId(user)) {
    return true;
  }

  return user.role === 'admin';
}

export function deriveAdminRole(user: User | null | undefined): AdminRole | null {
  if (!user) return null;

  if (isSuperAdminUser(user)) return 'super_admin';

  const role = readMetadataRole(user);
  if (role === 'org_admin') return 'org_admin';
  if (role === 'worker') return 'worker';
  if (readOrgId(user)) return 'org_admin';
  if (readRaffleId(user)) return 'worker';

  return null;
}
