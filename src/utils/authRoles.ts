import type { User } from '@supabase/supabase-js';
import type { AdminRole } from '../types';

/**
 * SECURITY: Platform super-admin is ONLY app_metadata.role.
 * user_metadata.role is client-writable and must never grant privilege.
 */
function readAppRole(user: User): string | undefined {
  return user.app_metadata?.role as string | undefined;
}

function readScopedRole(user: User): string | undefined {
  const userRole = user.user_metadata?.role as string | undefined;
  // Ignore forgeable platform-admin marks in user_metadata
  if (userRole === 'admin' || userRole === 'super_admin') {
    return user.app_metadata?.role as string | undefined;
  }
  return (
    userRole ?? (user.app_metadata?.role as string | undefined)
  );
}

export function readMetadataRole(user: User): string | undefined {
  return readScopedRole(user);
}

/** @deprecated Prefer isSuperAdminUser — kept name for call sites. */
export function hasSuperAdminRoleMark(user: User): boolean {
  const role = readAppRole(user);
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = readAppRole(user);
  return role === 'admin' || role === 'super_admin';
}

export function deriveAdminRole(user: User | null | undefined): AdminRole | null {
  if (!user) return null;

  if (isSuperAdminUser(user)) return 'super_admin';

  const role = readScopedRole(user);
  // Explicit role only — do not infer admin from forgeable organization_id / raffle_id.
  if (role === 'org_admin') return 'org_admin';
  if (role === 'worker') return 'worker';

  return null;
}
