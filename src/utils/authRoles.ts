import type { User } from '@supabase/supabase-js';
import type { AdminRole } from '../types';

/**
 * SECURITY: Platform super-admin is ONLY app_metadata.role.
 * user_metadata.role is client-writable and must never grant privilege.
 *
 * org_admin / worker strings in user_metadata are UX cache only.
 * Gatekeeping must use organization.owner_id / worker table (RLS helpers).
 */
function readAppRole(user: User): string | undefined {
  return user.app_metadata?.role as string | undefined;
}

function readScopedRoleHint(user: User): string | undefined {
  const userRole = user.user_metadata?.role as string | undefined;
  // Ignore forgeable platform-admin marks in user_metadata
  if (userRole === 'admin' || userRole === 'super_admin') {
    return user.app_metadata?.role as string | undefined;
  }
  return (
    userRole ?? (user.app_metadata?.role as string | undefined)
  );
}

/** UX cache — forgeable. Prefer DB ownership / worker rows for authz. */
export function readMetadataRole(user: User): string | undefined {
  return readScopedRoleHint(user);
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

/**
 * Role for UI routing. org_admin/worker come from forgeable metadata hints;
 * data access is enforced by RLS (owns_organization / is_worker_for_raffle).
 * Login remaps forged organization_id to owned orgs or empty scope.
 */
export function deriveAdminRole(user: User | null | undefined): AdminRole | null {
  if (!user) return null;

  if (isSuperAdminUser(user)) return 'super_admin';

  const role = readScopedRoleHint(user);
  if (role === 'org_admin') return 'org_admin';
  if (role === 'worker') return 'worker';

  return null;
}
