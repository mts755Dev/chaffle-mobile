import type { AdminRole } from '../types';

/** Manual draw: super admin and org admin, any time before a winner exists. */
export function canManualDrawRaffle(role: AdminRole | null): boolean {
  return role === 'super_admin' || role === 'org_admin';
}
