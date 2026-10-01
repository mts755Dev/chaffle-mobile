import type { User } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SECURITY: Platform super-admin is ONLY app_metadata.role.
 * user_metadata.role is client-writable via auth.updateUser — never trust it
 * for privilege. Org-admin paths must verify organization.owner_id in DB.
 */
export function isSuperAdmin(user: User): boolean {
  const role = user.app_metadata?.role as string | undefined;
  return role === "admin" || role === "super_admin";
}

/**
 * Metadata hint only — forgeable. Call sites must still verify DB ownership
 * (e.g. assertOrgAdminCanDrawRaffle / callerOwnsOrganization).
 */
export function isOrgAdmin(user: User): boolean {
  if (isSuperAdmin(user)) return false;
  const userRole = user.user_metadata?.role as string | undefined;
  if (userRole === "admin" || userRole === "super_admin") {
    return (user.app_metadata?.role as string | undefined) === "org_admin";
  }
  const role =
    userRole ?? (user.app_metadata?.role as string | undefined);
  return role === "org_admin";
}

/**
 * Manual draw candidate: super admin, or any authenticated user who will be
 * ownership-checked against the raffle's organization in the edge handler.
 * Do not treat JWT org_admin alone as sufficient.
 */
export function canManualDraw(user: User): boolean {
  return isSuperAdmin(user) || !!user?.id;
}
